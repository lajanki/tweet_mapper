/* Javascript functions for binding tweets with the map
12.10.2016
*/



/************************************************************************
* Global variables *
********************/

// arrays for markers placed on the map and unique addresses detected
var _markers = [];
var _uaddress = [];

// An array to specify the name and color for markers types.
// Preserves order when iterated!
var _markerSettings = [
  ["_green", "Coordinates"],
  ["_yellow", "Place"],
  ["", "Location"]
];

// Initialize a mapping between twitter user ids/addresses and marker labels
var _labels = {};

// Setup an object for the most recent timeline fetched
// and a field for the user whose details are currently seen in the details bar
var _timeline = {"user": "", "timeline": []}
var _currentUser = "";

// Flag to showDetails() preventing it from overwtiring actual details with
// question mark images. (Global variable to prevent convoluted argument passing scheme.)
var _missingDetails = true;


/************************************************************************
* Twitter query *
****************/

/* Make an AJAX request to fetch_tweets.php to get tweets near
the given location. Place a map marker for each tweet and embeds
them to the sidebar.
Args:
  lat (flost): the latitude as degrees
  lng (float): longitude in degrees
*/
function fetchTweets(lat, lng) {
  // Clear previous data
  clearMarkers();
  _labels = {};
  showLoader();
  clearDetails();
  _missingDetails = true;

  _currentUser = "";
  _timeline["user"] = "";

  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response_str = this.responseText;
      var tweets = JSON.parse(response_str);

      // Trace retweets
      tweets = traceRetweets(tweets);
      // Add embed codes
      tweets = addEmbeds(tweets);

      
      // Empty the sidebar and add the new tweets to it
      document.getElementById("tweets").innerHTML = null;
      displayTweets(tweets);

      // Hide the loader and show tweets,
      // use a small delay to allow the tweets to be fully rendered
      setTimeout(hideLoader, 410)
      
    }
    else if (this.status == 500) {
      setMessage("Something went wrong :( The server encoutered an internal error with the following message:<br/>" +
         this.statusText + "<br/>Try again.");
    }
  }
  xmlhttp.open("GET", "./php/fetch_tweets.php?lat="+lat+"&lng="+lng, true);
  xmlhttp.send();
}

/* AJAX request for fetching a user timeline. */
function fetchTimeline(user) {
  // Check if this timeline is already fetched (ie. most recent timeline is the right one)
  if (_timeline["user"] == user) {
    console.log("Timeline for " + user + " already fetched.");
    return;
  }

  // Clear previous data
  clearMarkers();
  _labels = {};
  showLoader();
  // Only clear the detail bar if fetching data for a new user
  if (user != _currentUser) {
    clearDetails();
  }
  // clear question marks from source-chart and read-count regardless of user
  document.getElementById("source-chart").innerHTML = null;
  document.getElementById("read-count").innerHTML = "Recently received retweets and likes:";

  // Hide the "fetch timeline for details" link in the details bar
  document.getElementById("fetch-timeline").style.display = "none";

  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response_str = this.responseText;
      var timeline = JSON.parse(response_str);
      _timeline["user"] = user;
      _timeline["timeline"] = timeline;
      _currentUser = user;

      // Add embed codes
      timeline = addEmbeds(timeline);

      // Compute timeline statistics and display in the detail bar
      fillTimelineDetails(timeline);
      _missingDetails = false;

      // Clear the sidebar and show new content
      document.getElementById("tweets").innerHTML = null;
      displayTimeline(timeline);
      setTimeout(hideLoader, 410);
    }
    else if (this.status == 500) {
      setMessage("Something went wrong :( The server encoutered an internal error with the following message:<br/>" +
         this.statusText + "<br/>Try again.");
    }
  }
  xmlhttp.open("GET", "./php/fetch_tweets.php?user="+user, true);
  xmlhttp.send();
}



/* A wrapper to reading the username from the searchBox and passing
it to fetchTimeLine().*/
function getUserValue(event) {
  // Check for Enter key press
  if (event.which != 13) {
    return;
  }

  var user = document.getElementById("searchbox").value;
  // Trim @ from the beginning
  if (user[0] == "@") {
    user = user.substring(1)
  }
  if (!validTwitteUser(user)) {
    document.getElementById("searchbox").value = "";
    var msg = "<p class=\"error\"><i>" + user + "</i> is not a valid Twitter username.</p>";
    setMessage(msg, true);
    return;
  }
  
  fetchTimeline(user);
}


/* Compute statistics on recent tweets posted by the given user:
1. total number of likes + RTs (tweets read measure),
2. tweet sources
Arg:
  timeline (Array): a timeline of tweets as an array of tweet objects
*/
function computeTimelineDetails(timeline) {
  var likes = 0;
  var rts = 0;
  var sources = {};
  var hashtags = {};
  var mentions = {};
  var urls = {};

  for (var i = 0; i < timeline.length; i++) {
    // likes and RTs
    var tweet = timeline[i];
    likes += tweet["favorite_count"];
    rts += tweet["retweet_count"];

    // sources
    var source = tweet["source"];
    incrementKey(sources, source);
    
    //console.log(tweet);
    // user mentions
    var entitiesMentions = tweet["entities"]["user_mentions"];
    for (var j = 0; j < entitiesMentions.length; j++) {
      var mention = entitiesMentions[j]["screen_name"];
      if (mention) {
        incrementKey(mentions, mention);
      }
    }
     
    // hashtags
    var entitiesHashtags = tweet["entities"]["hashtags"];
    for (var j = 0; j < entitiesHashtags.length; j++) {
      var hashtag = entitiesHashtags[j]["text"];
      if (hashtag) {
        incrementKey(hashtags, hashtag);
      }
    }

    // urls
    var entitiesUrls = tweet["entities"]["urls"];
    for (var j = 0; j < entitiesUrls.length; j++) {
      var url = entitiesUrls[j]["display_url"];
      if (url) {
        // split by "/" to get the domain name
        url = url.split("/")[0];
        incrementKey(urls, url);
      }
    }
  }

  var stats = {
    "likes": likes,
    "rts": rts,
    "sources": sources,
    "hashtags": hashtags,
    "mentions": mentions,
    "urls": urls
  }

  return stats;
}

/* Fill retweets+likes received and tweet source chart to teh detail bar.*/
function fillTimelineDetails(timeline) {
  var stats = computeTimelineDetails(timeline);
  createSourceChart(stats["sources"]);
  var likes = formatThousands(stats["likes"] + stats["rts"]);
  document.getElementById("read-count").innerHTML = "Recently received retweets and likes: " + likes;
  console.log("stats:", stats);
}

/************************************************************************
* Twitter Widget Factory functions *
***********************************/

/* Display a timeline, see
https://dev.twitter.com/web/javascript/creating-widgets#create-timeline */
function factoryTimeline(screenName) {
  document.getElementById("tweets").innerHTML = null;

  twttr.widgets.createTimeline({
    sourceType: "profile",
    screenName: screenName
  },
  document.getElementById("tweets"),
  {
    width: '450',
    height: '700',
  }).then(function (el) {
    console.log("Embedded a timeline.")
  });
}

/* Show a timeline of likes of the user. */
function factoryLikes(screenName) {
  document.getElementById("tweets").innerHTML = null;

  twttr.widgets.createTimeline({
    sourceType: "likes",
    screenName: screenName
  },
  document.getElementById("tweets"));
}


/************************************************************************
* Show tweets *
**************/

/* Draw a map marker to each tweet in tweetData and embed them to the sidebar.
Arg:
  tweetData (JSON): a JSON encoded string of the response from Twitter search API
*/
function displayTweets(tweetData) {
  // Don't add anything if we are currently in a different mode
  if (mode != "locator") {
    return;
  }

  if (tweetData.length == 0) {
    // Empty the sidebar and display a message to the user
    setMessage("No tweets found near this location.");
  }

  try {
    for (i=0; i<tweetData.length; i++) {
      tweet = tweetData[i];
      var user_id = tweet["user"]["id_str"];
      var screen_name = tweet["user"]["screen_name"];
      var label;
      var color;

      // Log tweet url for debugging purposes
      var url = "http://twitter.com/" + tweet["user"]["screen_name"] + "/status/" + tweet["id_str"];
      //console.log("tweet: " + url);

      // Filter out possibly sensitive content (affects tweets with link only)
      if (tweet["possibly_sensitive"]) {
        continue;
      }
     

      // If the tweet has location data, draw a marker or  use Google Maps Geocode API
      // to first transform a location to coordinates.
      //  1 tweet has coordinate data
      if (tweet["coordinates"]) {
        var coords = tweet["coordinates"]["coordinates"];  // (longitude, latitude) pair
        var position = {lat: coords[1], lng: coords[0]};
        color = _markerSettings[0][0];
        label = getLabel(user_id);
        tweet["loc"] = null;  // Add tweet location data as a general attribute for ease of access
        placeMarker(position, label, color);
        //console.log("Coordinates: (" + position.lat + ", " + position.lng + ")");
      }

      //  2 Geocode a location and place marker
      else if (tweet["place"]) {
        var loc = tweet["place"]["full_name"];
        tweet["loc"] = loc;
        color = _markerSettings[1][0];
        label = addToMap(loc, color);
        //console.log("Place: " + loc);
      }

      //  3 No tweet location available: try to geocode
      //    user defined location
      else {
        var loc = tweet["user"]["location"];
        // remove any extra characters
        loc = loc.replace("#", "");
        loc = loc.replace("@", "");
        loc = loc.replace("\"", "");
        if (loc) {
          tweet["loc"] = loc;
          color = _markerSettings[2][0];
          label = addToMap(loc, color);
          //console.log("User location: " + loc);
        }
      }

      // Embed the tweet to the sidebar
      addTweetToSideBar(tweet, label, color);
    }
    // Force tweet renderin by manually loading widget.js
    // (otherwise tweets remain as blockquotes for some reason)
    twttr.widgets.load(document.getElementById("tweets"));
  }

  // Stop showing the loader if something goes wrong
  catch(e) {
    console.log(e);
    hideLoader();
    setMessage("<p class=\"error\">Something went wrong :( Try reloading the page.</p>", true);
  }
}

/* Embed a users timeline to the sidebar and show tweets on the map.
A modified version of displayTweets().
Args:
  timeline (JSON): a list of tweets in the timeline as returned by the API
*/
function displayTimeline(timeline) {
  // Don't add anything if we are currently in a different mode
  if (mode != "locator") {
    return;
  }

  // Check if any Twitter errors occured
  if (timeline.errors) {
    var msg;
    var screen_name = document.getElementById("searchbox").value;
    document.getElementById("searchbox").value = "";
    // Grab the first error message
    if(timeline.errors[0]["code"] == 34) {
      msg = "There is no Twitter account with the username <i>" + screen_name + "</i>";
    }
    else {
      msg = timeline.errors[0]["message"];
    }
    setMessage(msg, false);
    return;
  }

   // ...apparently there are 2 types of error responses
  else if (timeline.error) {
    var user = document.getElementById("searchbox").value;
    var url = "https://twitter.com/" + user;
    var msg = "<p class=\"error\">Something went wrong :( The following message was received:</p>\
      <ul><li>" + timeline.error + "</li></ul>\
      <p class=\"error\"><a href=\"" + url + "\">@" + user + "</a>Might be a private account.</p>";
    setMessage(msg, true);
    return;
  }
   
  // User exists but hasn't tweeted
  else if (timeline.length == 0) {
    var user = document.getElementById("searchbox").value;
    var url = "https://twitter.com/" + user;
    var msg = "<p class=\"error\">Looks like <a href=\"" + url + "\">@" + user + "</a> hasn't tweeted anything.</p>";
    setMessage(msg, true);
    return;
  }

  try {
    // Display user defined location on the map (only once, no label)
    var pan = true;
    var label;
    var userLoc = timeline[0]["user"]["location"];
    var screen_name = timeline[0]["user"]["screen_name"];
    var color = _markerSettings[2][0];
    // Check if the user has set a location
    if (!userLoc) {
      userLoc = "coords";
    }
    else {
      codeAddress(userLoc, "", color, pan);  // pan here
    }
    
    for (i=0; i<timeline.length; i++) {
      tweet = timeline[i];
      
      // Filter out possibly sensitive content (affects tweets with link only)
      if (tweet["possibly_sensitive"]) {
        continue;
      }


      // Attempt to locate the tweet: only look for tweet coordinates
      // or place data.
      if (tweet["coordinates"]) {
        // (longitude, latitude) pair
        var coords = tweet["coordinates"]["coordinates"];
        var position = {lat: coords[1], lng: coords[0]};
        // Create a label
        label = getLabel(tweet["id_str"]);
        color = _markerSettings[0][0];
        placeMarker(position, label, color, pan);  // pan to the first decoded location (eiher coordinates or place)
        pan = false;
        tweet["loc"] = null;
        //console.log("Found the following coordinates: (" + position.lat + ", " + position.lng + ")");
      }

      // Geocode a location and place marker
      else if (tweet["place"]) {
        var loc = tweet["place"]["full_name"];
        tweet["loc"] = loc;
        color = _markerSettings[1][0];
        label = addToMap(loc, color, pan);
        pan = false;
      }

      // No location data availalbe: set marker color and tweet metadata for sidebar.
      // Don't add a map marker.
      else {
        label = "";
        color = _markerSettings[2][0];
        tweet["loc"] = userLoc;
      }

      addTweetToSideBar(tweet, label, color);
    }

    // Show most recent tweet at the lower bar
    showDetails(timeline[0]);

    twttr.widgets.load(document.getElementById("tweets"));
  }

  // Stop showing the loader if something goes wrong
  catch(e) {
    console.log(e);
    hideLoader();
    setMessage("<p class=\"error\">Something went wrong :( Try reloading the page.</p>", true);
  }

}

/* Embed a tweet to the sidebar by creating a new <div> element for
the tweet and its metadata.
Args:
  tweet (JSON): a JSON encoded tweet object as returned by Twitter
  label (string): a letter to use as a marker label
  color (string): marker color
*/
function addTweetToSideBar(tweet, label, color) {
  // A container for the whole tweet
  var div = document.createElement("div");
  div.className = "tweet-card";
  div.innerHTML = tweet["embed"];  // fill the <div> with initial data

  // Create a container for 2 metadata <divs>
  var metaContainer = document.createElement("div");
  metaContainer.className = "meta-container";


  // 1st subdiv for marker icon, location and source
  var metadata = document.createElement("div");
  metadata.className = "tweet-metadata";

  // Create an <img> for control elements:
  // locate map marker
  var icon = document.createElement("img");
  icon.setAttribute("src", "http://maps.google.com/mapfiles/marker" + color + label + ".png");
  icon.setAttribute("alt", "locate this tweet");
  icon.setAttribute("class", "marker-icon");

  // Add a click event listener to the icon for panning to it
  icon.addEventListener("click", function(){
    panToMArker(label);
    showDetails(tweet);
  });

  // plot timeline and show details on the lower bar
  var timeline = document.createElement("img");
  timeline.setAttribute("src", "./img/location-map-marker-icons_red.png");
  timeline.setAttribute("alt", "plot timeline");
  timeline.setAttribute("class", "meta-icon");

  // Event listener: fetch recent tweets
  timeline.addEventListener("click", function() {
    fetchTimeline(tweet["user"]["screen_name"]);
  });

  // <p> for location
  var location = document.createElement("p");
  location.setAttribute("class", "meta-text");
  location.innerHTML = truncate(tweet["loc"]);

  // Add tweet source:
  // tweet["source"] is an <a> string, create a wrapper for it:
  var source = document.createElement("span");
  source.setAttribute("class", "meta-text");
  // Source may be an empty string
  if (!tweet["source"]) {
    tweet["source"] = "NA";
  }
  source.innerHTML = tweet["source"];

  // Shorten the source text if necessary
  var text = source.firstChild.text;
  source.firstChild.text = truncate(text, 24);

  // Add elements to the metadata bar
  metadata.appendChild(icon);
  metadata.appendChild(location);
  metadata.appendChild(source);
  metadata.appendChild(timeline);

  // Attach the metadata section to the top level <div>
  div.appendChild(metadata);

  // Append the new div to the sidebar
  var tweets = document.getElementById("tweets");
  tweets.appendChild(div);
}

/* Show tweet and user info on the lower bar. */
function showDetails(tweet) {
  var embed = tweet["embed"];
  var screen_name = tweet["user"]["screen_name"];
  
  // Show "fetch missing data" link if this user is different from the
  // one whose details are currently being shown
  if (_currentUser != screen_name) {
    document.getElementById("fetch-timeline").style.display = "block";
  }

  _currentUser = screen_name;
  
  // Set user links and description
  var ausername = document.getElementById("username");
  ausername.setAttribute('href', "https://twitter.com/" + screen_name);
  ausername.innerHTML = "@"+screen_name;

  // user description and url
  var pdescription = document.getElementById("account-description");
  var description = tweet["user"]["description"];
  if (!description) {
    description = "NA";
  }
  pdescription.innerHTML = description;

  var auserurl = document.getElementById("user-url");
  try {
    var url = tweet["user"]["entities"]["url"]["urls"][0]["expanded_url"];
    auserurl.setAttribute('href', url);
    auserurl.innerHTML = url;
    auser.style.display = "block";
  }
  catch(err) {
    auserurl.style.display = "none";
    //console.log("No links for: " + screen_name);
  }

  // user location
  var loc = tweet["user"]["location"];
  if (!loc) {
    loc = "NA";
  }
  document.getElementById("user-location").innerHTML = "location: " + loc;

  // Follower count
  var followerCount = formatThousands(tweet["user"]["followers_count"]);
  document.getElementById("follower-count").innerHTML = "Followers: " + followerCount;

  // Compute average tweet rate:
  // get number of days since join date by parsing join date to milliseconds
  var d = Date.parse(tweet["user"]["created_at"]);  // milliseconds since join date
  var daysSinceJoin = Math.round((Date.now() - d) / (1000 * 60 * 60 * 24));
  var statusesCount = tweet["user"]["statuses_count"];
  var tweetRate = document.getElementById("tweet-rate");
  tweetRate.innerHTML = "Average tweets/day: " + Math.round((statusesCount / daysSinceJoin));

  // Show question mark for "read-count" and "source-chart"
  if (_missingDetails) {
    document.getElementById("read-count").innerHTML = "Recently received retweets and likes: <img src=\"./img/questionmark.png\" alt=\"questionmark\" height=\"22\">";
    document.getElementById("source-chart").innerHTML = "<img src=\"./img/questionmark.png\" alt=\"questionmark\" height=\"100\" style=\"margin-left:75px\">";
  }


  // Embed tweet without media or thread data, 
  // See https://dev.twitter.com/web/embedded-tweets
  var cutEmbed = embed.replace("<blockquote class=\"twitter-tweet\" ", "<blockquote class=\"twitter-tweet\" data-cards=\"hidden\" data-conversation=\"none\" ");
  var tweetCard = document.getElementById("tweet-card");
  tweetCard.innerHTML = cutEmbed;
  
  twttr.widgets.load(document.getElementById("tweet-card"));
}

/* Set the detail bar back to orignal values */
function clearDetails() {
  // Account info
  document.getElementById("username").innerHTML = "@username";
  document.getElementById("account-description").innerHTML = "description";
  document.getElementById("user-url").text = "url";
  document.getElementById("user-location").innerHTML = "location:";

  // Tweet card
  document.getElementById("tweet-card").innerHTML = "&nbsp";

  // Statistics
  document.getElementById("follower-count").innerHTML = "Followers:";
  document.getElementById("tweet-rate").innerHTML = "Average tweets/day:";
  document.getElementById("read-count").innerHTML = "Recently received retweets and likes:";

  // Source chart
  document.getElementById("source-chart").innerHTML = null;
}

/* Create a pie chart for tweet source data. */
function createSourceChart(sourceData) {
  google.charts.setOnLoadCallback(function() {
    var dataPoints = [];
    // Create a DataTable instance and fill it with the required format
    var data = new google.visualization.DataTable();
    data.addColumn("string", "Source");
    data.addColumn("number", "Count");

    for (source in sourceData) {
      // Tweet source is an html string. Convert it to a DOM element to get its
      // text value
      var wrapper = document.createElement("div");
      wrapper.innerHTML = source;
      var sourceStr = wrapper.firstChild.text;

      // Format the data to [label, value]
      var p = [sourceStr, sourceData[source]];
      data.addRow(p);
    }

    var options = {
      //legend: {position: "labeled"}
    };

    var chart = new google.visualization.PieChart(document.getElementById('source-chart'));
    chart.draw(data, options);
  });
}


/************************************************************************
* Marker placing *
*****************/

/* Add an address to the map. Use checkAddress to determine if the
address matches a known address or whether it should be geocoded.
Args:
  address (string): the address where a marker should be placed
  color (string): marker color
  pan (boolean): whether the map should pan to the marker
Return:
  the label for the marker
*/
function addToMap(address, color, pan = false) {
  var match = checkAddress(address);
  var label;
  // The beginning of the address matches a known address.
  if (match) {
    label = getLabel(match);
  }
  // Not seen before: generate a new label and geocode.
  else {
    label = getLabel(address);
    _uaddress.push(address.toLowerCase());
    codeAddress(address, label, color, pan); 
  }
  return label;
}

/* Check if the beginning of an address matches a previously seen address.
Return:
  the matching address (in lowercase)
*/
function checkAddress(address) {
  var start = address.split(",")[0].toLowerCase();  // parse the start of the address as lowercase
  // remove unwanted characters
  // eg. "New York City" should match to "new york"
  start = start.replace("city", ""); 
  start = start.trim();  
  for (var i=0; i < _uaddress.length; i++) {
    // remove commas from the address to compare to
    // eg. "Corpus Christi TX" should match to "corpus christi, tx"
    var old = _uaddress[i].replace(",", "");
    if (old.indexOf(start) != -1 ) {
      // Set the labels to match
      console.log("'" + address + "' matches a previous location '" + _uaddress[i] + "'.");
      return _uaddress[i];
    }
  }
}

/* Geocode a string address to a LatLng object.
Note: the handler is an asynchronous function. Marker placing needs to happen
within succesfull request.*/
function codeAddress(address, label, color, pan = false) {
  geocoder.geocode( { 'address': address}, function(results, status) {
    if (status == 'OK') {
      // Geocoding may return more than 1 result, use the first one.
      var latLng = results[0].geometry.location;
      // Note that due to the asynchronous nature of this function,
      // messages will appear out of synch in the log.
      console.log("Geocoded '" + address + "' as " + latLng.toString());
      placeMarker(latLng, label, color, pan);

      // Add the geocoded entry to geo.db for easier accessing next time
      var lat = latLng.lat();
      var long = latLng.lng();
    }
    else {
      console.log("Couldn't geocode '" + address + "' for the following reason: " + status);
    }
  });
}

/* Place a map marker to the given location.
Args:
  location (LatLngLiteral or LatLng): the coordinates where to place the marker.
    The API will convert the more conveniant LatLngLiteral: {lat: -34, lng: 151} to a LatLng object when needed,
    see https://developers.google.com/maps/documentation/javascript/3.exp/reference#LatLng
  label (String): a string to use as a label for the marker
*/
function placeMarker(location, label, color, pan = false) {
  // Add a map marker to the given coordinates
  //console.log(markerlabel)
  var marker = new google.maps.Marker({
    position: location,
    map: map,
    clickable: false,
    mylabel: label, // add the label character as a custom attribute
    // set custom icon, see
    // http://ex-ample.blogspot.fi/2011/08/all-url-of-markers-used-by-google-maps.html
    icon: "http://maps.google.com/mapfiles/marker" + color + label + ".png"
    //title: "Hello World!"
  });

  _markers.push(marker);
  if (pan) {
    map.panTo(location);
  }
}

/* Remove markers from the map and delete references to them. */
function clearMarkers() {
  for (var i = _markers.length - 1; i >= 0; i--) {
    _markers[i].setMap(null);
  }
  _markers.length = null;
}

/* Pan to the given marker.
Arg:
  label (string) the label of the marker to pan to
*/
function panToMArker(label) {
  // Find the marker with this label
  var marker;
  for (i=0; i<_markers.length; i++) {
    if (_markers[i].mylabel == label) {
      marker = _markers[i];
      break;
    }
  }
  if (!marker) {
    console.log("Couldn't find marker " + label +". No such label.");
    return;
  }
  var coords = {lat: marker.position.lat(), lng: marker.position.lng()};
  map.panTo(coords);
  map.setZoom(12);
}







function test_cgi_ajax() {
  xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      console.log(this.responseText);
    }
  }

  xmlhttp.open("GET", "/cgi-bin/cgi_test.py?q=test_string", true);
  xmlhttp.send();
}

