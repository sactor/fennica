# fennica
Custom API for The National Bibliography of Finland, Fennica

This is an unofficial API which parses HTML results and will break if the HTTP interface of Fennica is altered.

## Install
```bash
npm install fennica
```

```javascript
const fennica = require('fennica');
const SEARCH_MODE = require('fennica').SEARCH_MODE;
```

## API

### `fennica.search(search, mode)`

Executes a search.

#### Parameters:

 * `search`, a String, search string
 * `mode`, a String, one of the modes available in SEARCH_MODE constant.

#### Returns:

Returns a Promise which will resolve once the search is complete. Promise result is an object with the following properties:

```javascript
{
  "results": [ // Results array
    {
      "author": { // Author information
        "lastname": "Pratchett", // Last name of the author, If author has only one name, e.g. Homeros, it will be here
        "firstname": "Terry", // Optional
        "additional": [ // Optional, describes author (in Finnish)
          "kirjoittaja"
        ] 
      },
      "original_title": "Witches abroad", // Title in original language
      "title": "Noitia maisemissa", // Localised title
      "language": "suomi", // Language
      "publishing_information": { // Publishing information
        "place": "Hämeenlinna", // Place of publishing
        "publisher": "Karisto", // Publisher
        "year": "2000" // Year of publishing
      },
      "measurements": { // Page measurements
        "pages": "309", // Page count
        "height": "18" // Height, in cm
      },
      "additional": { // Optional, Additional information about the book
        "editions": [ // Parsed edition information from the additional information
          {
            "edition": "3", // Edition number
            "year": "2002" // Edition year
          }
        ],
        "raw": "Lisäpainokset: 3. p. 2002." // Raw additional information from the bibliography
      },
      "original_language": "eng", // Optional, Original language
      "isbn": [ // ISBN information, may contain multiple ISBNs if the book has several editions
        "951-23-4113-1 nidottu"
      ],
      "udk_class": "820 -3", // The UDC class (or UDK in Finnish)
      "coauthors": [ // Co authors of the book
        {
          "lastname": "Sinkkonen",
          "firstname": "Marja", // Optional
          "additional": [ // Optional, describes co-author (in Finnish)
            "kääntäjä"
          ] 
        }
      ]
    }
  ],
  "url": "https://fennica.linneanet.fi/vwebv/search?searchArg=Noitia%20maisemissa&searchCode=TALL&setLimit=2&recCount=10&searchType=1&page.search.search.button=Hae" // URL used for this search
}
```