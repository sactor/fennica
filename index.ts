import * as jsdom from "jsdom";
const { JSDOM } = jsdom;
import * as _debug from "debug";
import * as md5 from "md5";

let debug = _debug("fennica");
let debugWarning = _debug("warning");

const cookieJar = new jsdom.CookieJar();

export namespace Fennica {
  export type MarcDataField = {
    code: string;
    value: string;
  };
  export type MarcIndicator = string[];
  export type MarcControlField = string;
  export type MarcData = {
    type: string;
    isControlField: boolean;
    data: MarcControlField | MarcDataField[];
    indicator?: MarcIndicator;
  };
  export type Author = {
    lastname: string;
    firstname?: string;
    additional?: string[];
  };
  export type Edition = {
    edition: number;
    year?: number;
  };
  export type Additional = {
    editions: Edition[];
    raw?: string;
  };
  export type Measurements = {
    pages?: number;
    height?: number;
    additional?: string;
  };
  export type PublishingInformation = {
    place?: string;
    publisher?: string;
    year?: number;
    year_original?: number;
    year_end?: number;
  };
  export type BookObject = {
    bib_id: string;
    author: Author[];
    original_title: string;
    title: string;
    language: string;
    edition?: Additional;
    publishing_information?: PublishingInformation;
    measurements?: Measurements;
    additional?: Additional;
    original_language?: string;
    isbn?: ISBNObject[];
    udk_class: string;
    ykl_class: string[];
    coauthors: Author[];
    keywords: string[];
    series?: Series[];
    original_series?: Series[];
    location?: string;
  };

  export type Series = {
    name: string;
    volume?: string;
  };

  export type BookField = {
    field: string;
    value:
      | string
      | Author
      | Additional
      | Measurements
      | PublishingInformation
      | ISBNObject[]
      | Author[];
  };
  export type ISBNObject = {
    isbn: string;
    additional?: string;
  };
  export type Result = {
    result: BookObject;
    url?: string;
  };
  export type SearchResult = {
    results: Array<Result | Author>;
    url: string;
  };

  export enum SEARCH_MODE {
    ISBN,
    TITLE,
    AUTHOR,
    BIB
  }

  const SUPPORTED_MARC_FIELDS = [
    "008",
    "020",
    "041",
    "080",
    "084",
    "100",
    "240",
    "245",
    "246",
    "250",
    "260",
    "300",
    "490",
    "650",
    "700",
    "800",
    "830",
    "852"
  ];
  const IGNORED_MARC_FIELDS = [
    "000",
    "001",
    "005",
    "015",
    "035",
    "040",
    "042",
    "264",
    "336",
    "337",
    "338",
    "610"
  ];

  const IGNORED_MARC_FIELDS_REGEX = [
    /^5/, // notifications
    /^7[6-8]/,
    /^8[4-8]/,
    /^9/
  ];

  const SEARCH_MODE_MAP = {
    [SEARCH_MODE.ISBN]: "020B",
    [SEARCH_MODE.TITLE]: "TALL",
    [SEARCH_MODE.AUTHOR]: "NAME%2B"
  };

  function handleSingleAuthorRow(authorinfo: string[]): Author | false {
    let author: Author = { lastname: "" };
    for (let i = 0; i < authorinfo.length; i++) {
      let info = authorinfo[i].trim();
      switch (i) {
        case 0:
          author.lastname = info.replace(/\.$/, "");
          break;
        case 1:
          author.firstname = info.replace(/([^A-Z])\.$/, "$1");
          break;
        default:
          if (info.length) {
            info = info.replace(/\.$/, "");
            if (info.includes("ennakkotieto")) {
              return false;
            }
            if (typeof author.additional === "undefined") {
              author.additional = [];
            }
            author.additional.push(info);
          }
      }
    }
    return author;
  }

  function handleEdition(input: string): Additional {
    let re = /(\d{1,2})\.(?:-(\d{1,2})\.)?(?: uud\.)? p(?:ainos)?\.(?: (\d{4}))?/g;
    let result;
    let additional: Additional = {
      editions: [],
      raw: input
    };
    while ((result = re.exec(input)) !== null) {
      let editionStart = parseInt(result[1]);
      let editionEnd = parseInt(result[2]);
      let year;
      if (typeof result[3] !== "undefined") {
        year = parseInt(result[3]);
      }
      let editionObject: Edition;
      if (editionEnd) {
        for (let i: number = editionStart; i <= editionEnd; i++) {
          editionObject = {
            edition: i
          };
          if (typeof year !== "undefined") {
            editionObject.year = year;
          }
          additional.editions.push(editionObject);
        }
      } else {
        editionObject = {
          edition: editionStart
        };
        if (typeof year !== "undefined") {
          editionObject.year = year;
        }
        additional.editions.push(editionObject);
      }
    }
    if (!additional.editions.length) {
      // Checking if we can understand finnish
      const edtable = [
        "Ensimmäinen",
        "Toinen",
        "Kolmas",
        "Neljäs",
        "Viides",
        "Kuudes",
        "Seitsemäs",
        "Kahdeksas",
        "Yhdeksäs",
        "Kymmenes"
      ];
      re = new RegExp("(" + edtable.join("|") + ") p(?:ainos)?\\.");
      if ((result = re.exec(input)) !== null) {
        let editionObject = {
          edition: edtable.indexOf(result[1]) + 1
        };
        additional.editions.push(editionObject);
      }
    }
    return additional;
  }

  let handleMarcField = (data: MarcData): BookField[] => {
    let indicatorString =
      typeof data.indicator !== "undefined" ? data.indicator.join("") : "";
    if (SUPPORTED_MARC_FIELDS.indexOf(data.type) === -1) {
      let unhandled = true;
      if (IGNORED_MARC_FIELDS.indexOf(data.type) !== -1) {
        unhandled = false;
      }
      IGNORED_MARC_FIELDS_REGEX.forEach((regex: RegExp) => {
        if (regex.test(data.type)) {
          unhandled = false;
        }
      });
      if (unhandled) {
        debugWarning(
          "Unhandled field " +
            indicatorString +
            ":" +
            data.type +
            " " +
            JSON.stringify(data.data)
        );
      } else {
        debug(
          "Ignored field " +
            indicatorString +
            ":" +
            data.type +
            " " +
            JSON.stringify(data.data)
        );
      }
      return [];
    }
    debug(
      "Handled field " +
        indicatorString +
        ":" +
        data.type +
        " " +
        JSON.stringify(data.data)
    );
    let fields: BookField[] = [];
    let rowData: MarcControlField | MarcDataField[];

    function addField(field: string, value: any): void {
      fields.push({
        field,
        value
      });
    }

    function unhandledSubfield(indicatorString, dataType, subdataCode, data) {
      debugWarning(
        "Unhandled subfield " +
          indicatorString +
          ":" +
          dataType +
          ":" +
          subdataCode +
          " " +
          JSON.stringify(data)
      );
    }

    switch (data.type) {
      case "008":
        rowData = <MarcControlField>data.data;
        let pubinf: PublishingInformation;
        switch (rowData[6]) {
          case "c":
          case "e":
          case "q":
          case "s":
          case "t":
          case "u":
            pubinf = {
              year: parseInt(rowData.substr(7, 4))
            };
            break;
          case "d":
          case "m":
            pubinf = {
              year: parseInt(rowData.substr(7, 4)),
              year_end: parseInt(rowData.substr(11, 4))
            };
            break;
          case "r":
            let original = parseInt(rowData.substr(11, 4));
            pubinf = {
              year: parseInt(rowData.substr(7, 4))
            };
            if (!isNaN(original)) {
              pubinf.year_original = original;
            }
            break;
          case "b":
          case "n":
          case "|":
            break;
          default:
            debugWarning("Unsupported publish date type: " + rowData[6]);
        }
        if (typeof pubinf !== "undefined") {
          addField("publishing_information", pubinf);
        }
        let lang = rowData.substr(35, 3);
        if (lang !== "|||") {
          addField("language", [lang]);
        }
        break;
      case "020":
        rowData = <MarcDataField[]>data.data;
        let isbn: ISBNObject = {
          isbn: null
        };
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              isbn.isbn = subdata.value;
              break;
            case "q":
              isbn.additional = subdata.value;
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        addField("isbn", [isbn]);
        break;
      case "041":
        rowData = <MarcDataField[]>data.data;
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              addField("language", [subdata.value]);
              break;
            case "h":
              addField("original_language", [subdata.value]);
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        break;
      case "080":
        rowData = <MarcDataField[]>data.data;
        let xHandled = false;
        let udkClass: string[] = [];
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              udkClass.push(subdata.value);
              break;
            case "x":
              if (!xHandled) {
                udkClass.push(subdata.value);
                xHandled = true;
              }
              break;
            case "2":
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        addField("udk_class", udkClass.join(" "));
        break;
      case "084":
        rowData = <MarcDataField[]>data.data;
        let isYkl = false;
        let yklClass: string = null;
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              yklClass = subdata.value;
              break;
            case "2":
              if (subdata.value === "ykl") {
                isYkl = true;
              }
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        if (isYkl) {
          addField("ykl_class", [yklClass]);
        }
        break;
      case "100":
        rowData = <MarcDataField[]>data.data;
        let authorObj: Author|false = false;
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              authorObj = handleSingleAuthorRow(subdata.value.split(","));
              break;
            case "c":
            case "e":
            case "g":
            case "j":
              if (authorObj !== false) {
                if (typeof authorObj.additional === "undefined") {
                  authorObj.additional = [];
                }
                authorObj.additional.push(subdata.value);
              } 
              break;
            case "d":
            case "0":
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        if (authorObj !== false) {
          addField("author", [authorObj]); // TODO etsi kirja, jolla useampia kuin yksi tekijä että toimiiko tämä varmasti
        }
        break;
      case "240":
        rowData = <MarcDataField[]>data.data;
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              addField("original_title", subdata.value.replace(/,$/, ""));
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        break;
      case "245":
        rowData = <MarcDataField[]>data.data;
        let title = [];
        let mainName;
        let subSeries;
        let partName;
        let volume;
        rowData.forEach(subdata => {
          let subvalue = subdata.value.replace(/[ .=,/]+$/, "");
          if (subdata.code === "n") {
            volume = subvalue;
          }
          if (subdata.code === "b") {
            subSeries = subvalue;
          }
          if (subdata.code === "p") {
            // This means this title is part of a series and a subdata can be used as series name and n as volume
            partName = subvalue;
          }
          switch (subdata.code) {
            case "a":
              mainName = subvalue;
            case "b":
              title.push(subvalue + " ");
              break;
            case "n":
              title.push(subvalue);
              break;
            case "p":
            case "c":
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        if (typeof mainName !== "undefined" && typeof partName !== "undefined" && typeof volume !== "undefined") {
          addField("series", [{name: mainName, volume}]);
          title = [mainName];
          if (typeof subSeries !== "undefined") {
            addField("series", [{name: subSeries}]);
            title.push("; " + subSeries);
          }
          title.push(", " + volume);
          title.push(" - " + partName);
        } else if (typeof partName !== "undefined") {
          if (title.length > 1) {
            title.push(", " + partName);
          } else {
            title.push(partName);
          }
        }
        if (title.length) {
          addField(
            "title",
            title
              .join("")
              .replace(/[\/.]$/, "")
              .trim()
          );
        }
        break;
      case "246":
        if (data.indicator[0] === "0" || data.indicator[0] === "2") {
          break;
        }
        rowData = <MarcDataField[]>data.data;
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              addField("title", " - " + subdata.value);
              break;
            case "i":
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        break;
      case "250":
        rowData = <MarcDataField[]>data.data;
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              addField("edition", handleEdition(subdata.value));
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        break;
      case "260":
        rowData = <MarcDataField[]>data.data;
        let publishInformation: PublishingInformation = {};
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              if (subdata.value !== "[S.l.]") {
                publishInformation.place = subdata.value
                  .replace(/ :$/, "")
                  .replace(/[\[\]]/g, "");
              }
              break;
            case "b":
              if (subdata.value !== "[s.n.]") {
                publishInformation.publisher = subdata.value
                  .replace(/,$/, "")
                  .replace(/[\[\]]/g, "");
              }
              break;
            case "c":
              const match = subdata.value.match(/[\d]{4}/);
              if (match !== null) {
                let year = parseInt(match[0]);
                if (!isNaN(year)) {
                  publishInformation.year = year;
                }
              } else {
                debug("match null from " + subdata.value);
              }
              break;
            case "e":
            case "f":
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        addField("publishing_information", publishInformation);
        break;
      case "300":
        rowData = <MarcDataField[]>data.data;
        let measurements: Measurements = {};
        rowData.forEach(subdata => {
          let parts: string[];
          switch (subdata.code) {
            case "a":
              parts = subdata.value.split(" ");
              if (
                ["s.", "sivua"].indexOf(parts[1]) !== -1 &&
                parts.length >= 2
              ) {
                measurements.pages = parseInt(parts[0]);
              }
              break;
            case "b":
              measurements.additional = subdata.value.replace(/ ;$/, "");
              break;
            case "c":
              parts = subdata.value.split(" ");
              if (parts.length === 2) {
                switch (parts[1]) {
                  case "cm":
                    measurements.height = parseInt(parts[0]) * 10;
                    break;
                  case "mm":
                    measurements.height = parseInt(parts[0]);
                    break;
                  default:
                    debug("Unhandled measurement " + subdata.value);
                }
              } else {
                debug("Unhandled measurement " + subdata.value);
              }
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        addField("measurements", measurements);
        break;
      case "650":
        rowData = <MarcDataField[]>data.data;
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              addField("keywords", [subdata.value]);
              break;
            case "2":
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        break;
      case "700":
        rowData = <MarcDataField[]>data.data;
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              addField("coauthors", [
                handleSingleAuthorRow(subdata.value.split(","))
              ]);
              break;
            case "i":
            case "d":
            case "t":
            case "0":
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        break;
      case "490":
      case "830":
        rowData = <MarcDataField[]>data.data;
        let series: Series = {
          name: ""
        };
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              series.name = subdata.value.replace(/[\.;,]$/, "").trim();
              break;
            case "v":
              series.volume = subdata.value.replace(/[\.;,]$/, "").trim();
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        if (series.name.length) {
          addField(data.type === "490" ? "series" : "original_series", [series]);
        }
        break;
      case "800":
        rowData = <MarcDataField[]>data.data;
        let ser: Series = {
          name: ""
        };
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "t":
              ser.name = subdata.value.replace(/[\.;,]$/, "").trim();
              break;
            case "v":
              ser.volume = subdata.value.replace(/[\.;,]$/, "").trim();
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        if (ser.name.length) {
          addField("original_series", ser);
        }
        break;
      case "852":
        rowData = <MarcDataField[]>data.data;
        let location: string = "";
        rowData.forEach(subdata => {
          switch (subdata.code) {
            case "a":
              location = subdata.value.trim();
              break;
            default:
              unhandledSubfield(
                indicatorString,
                data.type,
                subdata.code,
                data.data
              );
          }
        });
        if (location.length) {
          addField("location", location);
        }
        break;
    }
    return fields;
  };

  function handleSingleBook(
    search: string,
    dom: Window,
    bibId?: string
  ): Promise<boolean | null | BookObject> {
    return new Promise((resolve, reject) => {
      try {
        if (typeof bibId === "undefined") {
          // find bibId for the book on the page and load the staffView (marc)
          let actionBoxLinks = Array.from(
            dom.document.querySelectorAll(".actionBox a")
          );
          if (!actionBoxLinks.length) {
            reject("Can't find marc link");
            return;
          }
          actionBoxLinks.map((ele: Element) => {
            if (
              ele.textContent
                .trim()
                .toLowerCase()
                .search(/marc/) !== -1
            ) {
              const marcurl = ele.getAttribute("href");
              const bibMatch = marcurl.match(/bibId=([\d]+)/);
              bibId = bibMatch[1];
              // marc link
              const stop = new Date().getTime() + 1000;
              while (new Date().getTime() < stop) {}
              JSDOM.fromURL("https://fennica.linneanet.fi/vwebv/" + marcurl, {
                cookieJar
              }).then(dom => {
                debug(
                  "request done " +
                    "https://fennica.linneanet.fi/vwebv/" +
                    marcurl
                );
                handleSingleBook(search, dom.window, bibId)
                  .then(resolve)
                  .catch(reject);
              });
            }
          });
          return;
        }
        let bookObject: BookObject = {
          bib_id: bibId,
          author: [],
          original_title: "",
          title: "",
          language: "",
          isbn: [],
          udk_class: "",
          ykl_class: [],
          coauthors: [],
          keywords: []
        };
        let lis = dom.document.querySelectorAll("#divbib > ul > li");
        // debug(dom.document.querySelector("body").innerHTML);

        Array.from(lis).map((ele: Element) => {
          let tagLabel = ele.querySelector(".tagLabel");
          if (tagLabel === null) {
            reject(tagLabel);
            return;
          }
          let label = tagLabel.textContent;
          let indicator = ele.querySelector(".tagLabel2");
          let controlField = indicator === null;
          let fieldTextElements = !controlField
            ? ele.querySelectorAll(".fieldText span")
            : ele.querySelectorAll(".fieldText");
          let activeSub: string = null;
          let data: MarcData = {
            type: label,
            isControlField: controlField,
            data: null
          };
          let fieldData: MarcDataField[] = [];
          if (!controlField) {
            data.indicator = indicator.textContent.split("");
          }
          Array.from(fieldTextElements).forEach(span => {
            if (controlField) {
              data.data = span.textContent;
              return;
            }
            if (span.className === "boldit") {
              activeSub = span.textContent;
            }
            if (span.className === "subfieldMarcData") {
              fieldData.push({
                code: activeSub,
                value: span.textContent
              });
            }
          });
          if (!controlField) {
            data.data = fieldData;
          }
          let field = handleMarcField(data);
          field.forEach(field => {
            if (
              typeof bookObject[field.field] === "object" &&
              typeof field.value === "object"
            ) {
              if (Array.isArray(bookObject[field.field])) {
                let arr = <object[]>field.value;
                bookObject[field.field] = [...new Set([...bookObject[field.field], ...arr].map(o => JSON.stringify(o)))].map(s => JSON.parse(s));
              } else {
                bookObject[field.field] = {
                  ...bookObject[field.field],
                  ...field.value
                };
              }
            } else if (
              typeof bookObject[field.field] === "string" &&
              typeof field.value === "string" &&
              field.value.indexOf(" - ") === 0
            ) {
              bookObject[field.field] += field.value;
            } else {
              bookObject[field.field] = field.value;
            }
          });
          return data;
        });

        resolve(bookObject);
      } catch (e) {
        reject(e);
      }
      return;
    });
  }

  function handleSearchResult(
    search: string,
    mode: SEARCH_MODE,
    dom: Window
  ): Promise<Array<Result | Author>> {
    return new Promise((resolve, reject) => {
      try {
        let results: Array<Result | Author> = [];
        if (dom.document.querySelectorAll(".noHitsError").length) {
          resolve([]);
        }
        switch (mode) {
          case SEARCH_MODE.AUTHOR:
            let nameElements = dom.document.querySelectorAll(
              ".resultHeading a"
            );
            let repeatchecker: string[] = [];
            Array.from(nameElements).map((ele: Element) => {
              let parts = ele.textContent.trim().split(",");
              if (parts[0].length > 0) {
                let result: Result | Author = {
                  lastname: parts[0]
                };
                if (parts.length > 1) {
                  let firstname = parts[1].trim().replace(/([^A-Z])\.$/, "$1");
                  if (firstname.length > 0) {
                    result.firstname = firstname;
                  }
                }
                let hash = md5(
                  result.lastname +
                    (typeof result.firstname !== "undefined"
                      ? result.firstname
                      : "")
                );
                if (repeatchecker.indexOf(hash) === -1) {
                  repeatchecker.push(hash);
                  results.push(result);
                }
              }
            });
            resolve(results);
            break;
          case SEARCH_MODE.ISBN:
            handleSingleBook(search, dom)
              .then(result => {
                if (result !== null && typeof result !== "boolean") {
                  results.push({ result });
                }
                resolve(results);
              })
              .catch(reject);
            return;
          case SEARCH_MODE.BIB:
            handleSingleBook("", dom, search)
              .then(result => {
                if (result !== null && typeof result !== "boolean") {
                  results.push({ result });
                }
                resolve(results);
              })
              .catch(reject);
            return;
          case SEARCH_MODE.TITLE:
            let links = dom.document.querySelectorAll(".line1Link");
            if (!links.length) {
              // Probably a direct hit, handle a single book result
              handleSingleBook(search, dom).then(result => {
                if (result !== null && typeof result !== "boolean") {
                  results.push({ result });
                }
                resolve(results);
              });
              return;
            }
            let promises: Promise<Result>[] = [];
            Array.from(links).map((ele: Element) => {
              let titleParts = ele.textContent
                .trim()
                .replace(/\.$/, "")
                .split("/");
              let title: string;
              if (titleParts.length > 1) {
                title = titleParts
                  .slice(0, titleParts.length - 1)
                  .join("/")
                  .trim();
              } else {
                title = titleParts[0];
              }
              if (title.toLowerCase().includes(search.toLowerCase())) {
                // Candidate for a search result, get the book page
                promises.push(
                  new Promise<Result>((linkresolve, linkreject) => {
                    let href = ele.querySelector("a").getAttribute("href");
                    let searchurl =
                      "https://fennica.linneanet.fi/vwebv/" + href;
                    debug("starting sub request " + searchurl);
                    JSDOM.fromURL(searchurl)
                      .then(dom => {
                        debug("sub request done " + href);
                        let bibMatch = searchurl.match(/bibId=([\d]+)/);
                        if (bibMatch !== null) {
                          handleSingleBook(
                            search,
                            dom.window
                            // bibMatch[1]
                          )
                            .then(result => {
                              if (
                                result !== null &&
                                typeof result !== "boolean"
                              ) {
                                linkresolve({ result, url: searchurl });
                              } else {
                                linkreject("not book result");
                              }
                            })
                            .catch(linkreject);
                        } else {
                          linkreject(null);
                        }
                      })
                      .catch(err => {
                        linkreject(err);
                      });
                  })
                );
              }
            });
            Promise.all(promises).then(results => {
              results = results.filter(res => {
                return res !== null;
              });
              resolve(results);
            });
            return;
        }
        reject("no result");
      } catch (e) {
        reject(e);
      }
    });
  }

  export function search(
    search: string,
    mode: SEARCH_MODE
  ): Promise<SearchResult> {
    return new Promise<SearchResult>((resolve, reject) => {
      try {
        let searchurl, actualurl;
        switch (mode) {
          case SEARCH_MODE.BIB:
            searchurl = "https://fennica.linneanet.fi/vwebv/searchBasic";
            actualurl = "https://fennica.linneanet.fi/vwebv/staffView?bibId=%s".replace(
              /%s/,
              encodeURIComponent(search)
            );
            break;
          default:
            searchurl = "https://fennica.linneanet.fi/vwebv/search?searchArg=%s&searchCode=%m&setLimit=2&recCount=10&searchType=1&page.search.search.button=Hae&sortBy=PUB_DATE"
              .replace(/%s/g, encodeURIComponent(search))
              .replace(/%m/g, SEARCH_MODE_MAP[mode]);
        }
        debug("starting request " + searchurl);
        JSDOM.fromURL(searchurl, { cookieJar }).then(dom => {
          if (typeof actualurl !== "undefined") { // extra step needed because fennica requires a session before looking at a marc view
            JSDOM.fromURL(actualurl, { cookieJar }).then(dom => {
              handleSearchResult(search, mode, dom.window)
                .then(res => {
                  resolve({
                    results: res,
                    url: searchurl
                  });
                })
                .catch(err => {
                  debug(err);
                });
            });
            return;
          }
          handleSearchResult(search, mode, dom.window)
            .then(res => {
              resolve({
                results: res,
                url: searchurl
              });
            })
            .catch(err => {
              debug(err);
            });
        });
      } catch (e) {
        reject(e);
      }
    });
  }
}
