curl -X PUT "https://<YOUR_SEARCH_SERVICE>.search.windows.net/indexes/search-suggestions-index?api-version=2024-07-01" \
    -H "Content-Type: application/json" \
    -H "api-key: <YOUR_ADMIN_API_KEY>" \
    -d '{
      "name": "search-suggestions-index",
      "fields": [
        {
          "name": "id",
          "type": "Edm.String",
          "key": true,
          "searchable": false,
          "filterable": false,
          "sortable": false,
          "facetable": false
        },
        {
          "name": "text",
          "type": "Edm.String",
          "key": false,
          "searchable": true,
          "filterable": false,
          "sortable": false,
          "facetable": false,
          "analyzer": "en.microsoft"
        },
        {
          "name": "type",
          "type": "Edm.String",
          "key": false,
          "searchable": false,
          "filterable": true,
          "sortable": false,
          "facetable": true
        },
        {
          "name": "weight",
          "type": "Edm.Double",
          "key": false,
          "searchable": false,
          "filterable": true,
          "sortable": true,
          "facetable": false
        }
      ],
      "suggesters": [
        {
          "name": "sg",
          "searchMode": "analyzingInfixMatching",
          "sourceFields": ["text"]
        }
      ]
    }'