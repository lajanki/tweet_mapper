#[tweet_mapper](http://lajanki.mbnet.fi/tweet_mapper/)
Website for connecting Twitter search with Google maps

Shows tweets on a Google map and Twitter trending topics in a world chart.
In tweet mapping mode user can either
  1. click a location on the map and find tweets near that location, or
  2. plot a user's recent timeline on the map.
  
Some additional tweet information is shown on the lower part of the page.

In trend analyzer mode users can
  1. display a list of trending topics in a given country, or
  2. display a list of countries where a given topic is trending.
  
Tweet volumes are only shown for worldwide data, as the API doesn't seem to track
country specific values.

## Details
The server side is mostly PHP modified from [twitter-oauth.php](https://github.com/jonhurlock/Twitter-Application-Only-Authentication-OAuth-PHP) to interact with the Twitter API.
The server needs to authenticate itself with Twitter developer keys which should be stored in backend/keys.json. Additionally a the Google Maps JavaScript API requires a [key](https://developers.google.com/maps/documentation/javascript/get-api-key).
No user authentication is required.

Trend data is queried in a cache based system. The Python script in backend/tweet_locator.py pulls trending information from Twitter
and stores it locally to 2 files as
  1. available_trends.json: the list of countries where trending information is available, and
  2. trend.json: the list of actual trending data from the past 24h for each location listen in available_trends.json.
  
 All user interaction is refered to the local cache for speed and to avoid unnecessary API usage.
