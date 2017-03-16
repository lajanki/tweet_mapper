# [tweet_mapper](http://lajanki.mbnet.fi/tweet_mapper/)
Website for connecting Twitter search with Google maps

Shows tweets on a Google map and Twitter trending topics in a world chart.
In tweet mapping mode user can either
  1. click a location on the map and find tweets near that location, or
  2. plot a user's recent timeline on the map.
  
Addiotionally, when a timeline is fetched, some statistics is shown at bottom bar of the page.

In trend analyzer mode users can
  1. display a list of trending topics in a given country,
  2. display a list of countries where a given topic is trending,
  3. see a recent trend history graph for currently trending worldwide topics
  
Tweet volumes are only shown for worldwide data, as the API doesn't seem to track
country specific values.

## Details
The server side is mostly PHP modified from [twitter-oauth.php](https://github.com/jonhurlock/Twitter-Application-Only-Authentication-OAuth-PHP) to interact with the Twitter API.
The server needs to authenticate itself with Twitter developer keys which should be stored in backend/keys.json. Additionally a the Google Maps JavaScript API requires a [key](https://developers.google.com/maps/documentation/javascript/get-api-key), which should be set at the end of tweet_mapper.html

No user authentication is required.

Trend data is queried in a cache based system. The Python script in backend/tweet_locator.py pulls trending information from Twitter and creates a local cache of 3 files in backend/:
  1. available_trends.json: the list of countries where trending information is available, this is only fetched once and used to read the ids of countries whose data is to be fetched.
  2. trends.json: the list of actual trending data from the past 24h for each location listen in available_trends.json. This file is overwritten everytime new data is fetched.
  3. trends.db: a database for more permanent trending data storage. The data here is used to draw a line chart from recent trend history. A new table generated each week, table columns are timestamps when the data was queried and trend volumes are stored as rows.
  
 All user interaction is refered to the local cache for speed and to avoid unnecessary API usage.
 
### Requirements
 - [Twython](https://twython.readthedocs.io/en/latest/) for backend/tweet_mapper.py,
 - Twitter application [keys](https://apps.twitter.com/) to store in backend/keys.json, and
 - Google Maps JavaScript API [key](https://developers.google.com/maps/documentation/javascript/get-api-key) 
