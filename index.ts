import * as jsdom from 'jsdom';
import * as _debug from 'debug';
import * as md5 from 'md5';

let debug = _debug('fennica');

interface Window {
  $: any;
}

export namespace Fennica {
  export type Author = {
    lastname: string,
    firstname?: string,
    additional?: string[]
  }
  export type Edition = {
    edition: number,
    year?: number
  }
  export type Additional = {
    editions: Edition[],
    raw?: string
  }
  export type Measurements = {
    pages?: number,
    height?: number,
    additional?: string
  }
  export type PublishingInformation = {
    place?: string,
    publisher?: string,
    year?: number
  }
  export type BookObject = {
    bib_id: string,
    author: Author,
    original_title: string,
    title: string,
    language: string,
    edition?: Additional,
    publishing_information?: PublishingInformation,
    measurements?: Measurements,
    additional?: Additional,
    original_language?: string,
    isbn?: ISBNObject[],
    udk_class: string,
    coauthors: Author[]
  }
  export type ISBNObject = {
    isbn: string,
    additional?: string
  }
  export type Result = {
    result: BookObject,
    url?: string
  }
  export type SearchResult = {
    results: Array<Result | Author>,
    url: string
  }

  export enum SEARCH_MODE {
    ISBN,
    TITLE,
    AUTHOR
  }

  const SEARCH_MODE_MAP = {
    [SEARCH_MODE.ISBN]: '020B',
    [SEARCH_MODE.TITLE]: 'TALL',
    [SEARCH_MODE.AUTHOR]: 'NAME%2B'
  };

  const fields:{[key:string]: string} = {
    'Tekijä:': 'author',
    'Teos:': 'original_title',
    'Nimeke:': 'title',
    'Kieli:': 'language',
    'Julkaistu:': 'publishing_information',
    'Kustantaja:': 'publishing_information',
    'Alkuteoksen kieli:': 'original_language',
    'UDK-luokitus:': 'udk_class',
    'ISBN:': 'isbn',
    'Ulkoasu:': 'measurements',
    'Asiasana:': 'keywords',
    'Huomautus:': 'additional',
    'Muu(t) tekijä(t):': 'coauthors',
    'Painos:': 'edition',
  };

  const specials:{[key: string]: Function} = {
    author: (input: string, $: any): Author | false => {
      let authorinfo = $('<div>' + input + '</div>').text().split('\n')[0].split(',');
      return handleSingleAuthorRow(authorinfo);
    },
    coauthors: (input: string, $: any): Author[] => {
      let rows = $('<div>' + input + '</div>').text().split('\n');
      let authors: Author[] = [];
      rows.forEach((element: string) => {
        let raw = element.trim();
        if (raw.length) {
          let author = handleSingleAuthorRow(raw.split(','));
          if (author !== false) {
            authors.push(author);
          }
        }
      });
      return authors;
    },
    additional: (input: string, $: any): Additional => {
      let raw = $('<div>' + input + '</div>').text();
      let re = /(\d{1,2})\.(?:-(\d{1,2})\.)? p\.(?: (\d{4}))?/g;
      let result;
      let additional: Additional = {
        editions: [],
        raw
      };
      while ((result = re.exec(raw)) !== null) {
        let editionStart = parseInt(result[1]);
        let editionEnd = parseInt(result[2]);
        let year = parseInt(result[3]);
        if (editionEnd) {
          for (let i: number = editionStart; i <= editionEnd; i++) {
            additional.editions.push({ edition: i, year });
          }
        } else {
          additional.editions.push({ edition: editionStart, year });
        }
      }
      return additional;
    },
    edition: (input: string, $: any): Additional => {
      let raw = $('<div>' + input + '</div>').text();
      let re = /(\d{1,2})\.(?:-(\d{1,2})\.)? p\.(?: (\d{4}))?/g;
      let result;
      let additional: Additional = {
        editions: [],
        raw
      };
      while ((result = re.exec(raw)) !== null) {
        let editionStart = parseInt(result[1]);
        let editionEnd = parseInt(result[2]);
        let year;
        if (typeof result[3] !== 'undefined') {
          year = parseInt(result[3]);
        }
        let editionObject: Edition;
        if (editionEnd) {
          for (let i: number = editionStart; i <= editionEnd; i++) {
            editionObject = {
              edition: i
            };
            if (typeof year !== 'undefined') {
              editionObject.year = year;
            }
            additional.editions.push(editionObject);
          }
        } else {
          editionObject = {
            edition: editionStart
          };
          if (typeof year !== 'undefined') {
            editionObject.year = year;
          }
        additional.editions.push(editionObject);
        }
      }
      return additional;
    },
    title: (input: string): string => {
      return input.split('/')[0].trim();
    },
    isbn: (input: string): ISBNObject[] => {
      return input.split('<br>').map((val) => {
        let parts = val.trim().split(' ');
        let isbnInfo: ISBNObject = {isbn: parts[0]};
        if (parts.length > 1) {
          isbnInfo['additional'] = parts.slice(1).join(' ');
        }
        return isbnInfo;
      }).filter((val) => {
        return val['isbn'].length > 0;
      });
    },
    original_title: (input: string, $: any): string => {
      return $('<div>' + input + '</div>').text().replace(/[\[\]]/g, '').trim();
    },
    measurements: (input: string, $: any): Measurements => {
      let measurements: Measurements = {};
      let parts: string[] = $('<div>' + input + '</div>').text().split(/[;:,]/);
      parts.map((val) => {
        let propparts = val.trim().split(' ');
        if (propparts.length > 1) {
          switch (propparts[1]) {
            case 'cm':
              measurements['height'] = parseInt(propparts[0]);
              break;
            case 'sivua':
            case 's.':
              measurements['pages'] = parseInt(propparts[0]);
              break;
            default:
              debug('Dunno what is this prop:');
              debug(val);
          }
        } else {
          switch (propparts[0]) {
            case 'kuvitettu':
              measurements['additional'] = propparts[0];
              break;
            default:
              debug('Dunno how to handle parts for measurements prop: ');
              debug(val);
          }
        }
      });
      return measurements;
    },
    keywords: (input: string, $: any): string[] => {
      let parts: string[] = $('<div>' + input + '</div>').text().split('\n');
      parts = parts.map((part) => {
        return part.replace('(ysa)', '').trim();
      });
      parts = parts.filter((part) => {
        return part.length;
      });
      return parts;
    },
    publishing_information: (input: string, $: any): PublishingInformation => {
      let parts: string[] = $('<div>' + input + '</div>').text().split(',');
      let dateinfo: PublishingInformation = {};
      parts.map((part) => {
        let partinfo = part.trim().replace(/[\[\].]/g, '').replace(/(?:cop ([\d]{4}))/, '$1');
        if (isNaN(parseInt(partinfo))) {
          let subparts = partinfo.split(':');
          dateinfo['place'] = subparts[0].trim();
          if (subparts.length > 1) {
            dateinfo['publisher'] = subparts[1].trim();
          }
          if (subparts.length > 2) {
            debug('PARSE NOTICE: Apparently possible to have more parts');
            debug(subparts);
          }
        } else {
          dateinfo['year'] = parseInt(partinfo);
        }
      });
      return dateinfo;
    }
  };
  function handleSingleAuthorRow(authorinfo: string[]): Author | false {
    let author: Author = { lastname: '' };
    for (let i = 0; i < authorinfo.length; i++) {
      let info = authorinfo[i].trim();
      switch (i) {
        case 0:
          author['lastname'] = info.replace(/\.$/, '');
          break;
        case 1:
          author['firstname'] = info.replace(/([^A-Z])\.$/, '$1');
          break;
        default:
          info = info.replace(/\.$/, '');
          if (info.includes('ennakkotieto')) {
            return false;
          }
          if (typeof author['additional'] === 'undefined') {
            author['additional'] = [];
          }
          author['additional'].push(info);
      }
    }
    return author;
  }

  let handleField = (row: any, $: any): any => {
    if (row.find('.holdingsLabel').length > 0) {
      return null;
    }
    let field: string = row.find('.fieldLabelSpan').text();
    if (typeof fields[field] !== 'undefined') {
      let value;
      if (typeof specials[fields[field]] !== 'undefined') {
        value = row.find('.subfieldData').html().trim();
        value = specials[fields[field]](value, $);
        if (value === false) {
          return {
            field: 'rejected',
            value: null
          };
        }
      } else {
        value = row.find('.subfieldData').text().trim();
      }
      return {
        field: fields[field],
        value: value
      };
    } else {
      return null;
    }
  };

  function handleSingleBook(search: string, $: any, bibId?: string): null | BookObject {
    let bibTags = $('.bibTag');
    if (typeof bibId === 'undefined') {
      // find bibId for the book on the page
      let actionBoxLinks = $('.actionBox a');
      actionBoxLinks.each((i: number, ele: any) => {
        if ($(ele).text().trim().toLowerCase().search(/marc/) !== -1) {
          let bibMatch = $(ele).attr('href').match(/bibId=(\d+)/);
          if (bibMatch !== null) {
            bibId = bibMatch[1];
            return false;
          }
        }
      });
    }
    if (typeof bibId === 'undefined') {
      return null;
    }
    let bookObject: BookObject = {
      bib_id: bibId,
      author: {
        lastname: ''
      },
      original_title: '',
      title: '',
      language: '',
      isbn: [],
      udk_class: '',
      coauthors: []
    };
    let rejected = false;
    bibTags.each((i: number, ele: any) => {
      let field = handleField($(ele), $);
      if (field !== null) {
        if (field.field === 'rejected') {
          // Rejected result
          rejected = true;
          return false;
        }
        bookObject[field.field] = field.value;
      }
    });
    if (rejected) {
      return null;
    }
    if (bookObject['original_title'].length > 0) {
      return bookObject;
    }
    if (bookObject['title'].length > 0) {
      bookObject['original_title'] = bookObject['title'];
      return bookObject;
    }
    debug('For information, this book did not have title and was skipped from results:');
    debug(bookObject);
    return null;
  }

  function handleSearchResult(search: string, mode: SEARCH_MODE, $: any): Promise<Array<Result | Author>> {
    return new Promise((resolve, reject) => {
      let results: Array<Result | Author> = [];
      if ($('.noHitsError').length) {
        resolve([]);
      }
      switch (mode) {
        case SEARCH_MODE.AUTHOR:
          let nameElements = $('.resultHeading a');          
          let repeatchecker: string[] = [];
          nameElements.each(function() {
            let parts = $(this).text().trim().split(',');
            if (parts[0].length > 0) {
              let result: Author = {
                lastname: parts[0]
              };
              if (parts.length > 1) {
                let firstname = parts[1].trim().replace(/([^A-Z])\.$/, '$1');
                if (firstname.length > 0) {
                  result.firstname = firstname;
                }
              }
              let hash = md5(result.lastname + (typeof result.firstname !== 'undefined' ? result.firstname : ''));
              if (repeatchecker.indexOf(hash) === -1) {
                repeatchecker.push(hash);
                results.push(result);
              }
            }
          });
          break;
        case SEARCH_MODE.ISBN:
          let result = handleSingleBook(search, $);
          if (result !== null) {
            results.push({result});
          }
          break;
        case SEARCH_MODE.TITLE:
          let links = $('.line1Link');
          if (!links.length) {
            // Probably a direct hit, handle a single book result
            let result = handleSingleBook(search, $);
            if (result !== null) {
              results.push({
                result
              });
            }
            break;
          }
          let promises: Array<Promise<Result>> = [];
          links.each(function () {
            let titleParts = $(this).text().trim().replace(/\.$/, '').split('/');
            let title: string;
            if (titleParts.length > 1) {
              title = titleParts.slice(0, titleParts.length - 1).join('/').trim();
            } else {
              title = titleParts[0];
            }
            if (title.toLowerCase().includes(search.toLowerCase())) {
              // Candidate for a search result, get the book page
              promises.push(new Promise((linkresolve, linkreject) => {
                // debug($(this).find('a').attr('href')); // Logs link where single book info is found
                let href = $(this).find('a').attr('href');
                let searchurl = 'https://fennica.linneanet.fi/vwebv/' + href;
                debug('starting sub request ' + href);
                jsdom.env(
                  searchurl,
                  ['http://code.jquery.com/jquery.js'],
                  (err, window: Window) => {
                    debug('sub request done ' + href);
                    if (err) {
                      debug(err);
                      linkreject(err);
                      return;
                    }
                    let bibMatch = searchurl.match(/bibId=([\d]+)/);
                    let result = null;
                    if (bibMatch !== null) {
                      result = handleSingleBook(search, window.$, bibMatch[1]);
                    }
                    if (result !== null) {
                      linkresolve({
                        result,
                        url: searchurl
                      });
                    } else {
                      linkresolve(null);
                    }
                  }
                );
              }));
            }
          });
          Promise.all(promises).then((results) => {
            results = results.filter((res) => {
              return res !== null;
            });
            resolve(results);
          });
          return;
      }
      resolve(results);
    });
  }

  export function search(search: string, mode: SEARCH_MODE): Promise<SearchResult> {
    return new Promise<SearchResult>(
      (resolve, reject) => {
        let searchurl = 'https://fennica.linneanet.fi/vwebv/search?searchArg=%s&searchCode=%m&setLimit=2&recCount=10&searchType=1&page.search.search.button=Hae'
          .replace(/%s/g, encodeURIComponent(search))
          .replace(/%m/g, SEARCH_MODE_MAP[mode]);
        debug('starting request ' + searchurl);
        jsdom.env(
          searchurl,
          ['http://code.jquery.com/jquery.js'],
          (err, window: Window) => {
            debug('request done ' + searchurl);
            if (err) {
              reject(err);
              return;
            }
            handleSearchResult(search, mode, window.$)
              .then((res) => {
                resolve({
                  results: res,
                  url: searchurl
                });
              })
              .catch((err) => {
                console.log(err);
              });
          }
        );
      }
    );
  }
}
