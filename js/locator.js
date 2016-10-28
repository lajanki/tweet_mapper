/* Javascript functions for binding tweets with the map.

28.10.2016
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


/************************************************************************
* Twitter query *
****************/

/* Make an AJAX request to fetch_tweets.php to get tweets near
the given location. Place a map marker for each tweet and embeds
them to the sidebar.
Args:
  lat (float): latitude in degrees
  lng (float): longitude in degrees
*/
function fetchTweets(lat, lng) {
  // Clear previous data
  clearMarkers();
  _labels = {};
  showLoader();
  clearDetails();

  _timeline["user"] = "";

  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response_str = this.responseText;
      var tweets = JSON.parse(response_str);

      // Trace retweets and add embed codes
      if (tweets) {
        tweets = traceRetweets(tweets);
        tweets = addEmbeds(tweets);
      }
      
      // Empty the sidebar and add the new tweets to it
      document.getElementById("tweets").innerHTML = null;
      document.getElementById("tweet-card-header").innerHTML = "Selected/Typical tweet";
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

/* AJAX request for fetching a user timeline.
Arg:
  user (string): the screen name to the user whose timeline to fetch
*/
function fetchTimeline(user) {
  // Check if this timeline is already fetched (ie. most recent timeline is the right one)
  if (_timeline["user"] == user) {
    console.log("Timeline for " + user + " already fetched.");
    return;
  }

  // Set username to the searchbar
  document.getElementById("searchbox").value = user;

  // Clear previous data
  clearMarkers();
  _labels = {};
  showLoader();
  clearDetails();

  // clear "fetch timeline for details" button and question marks
  // regardless of current user
  document.getElementById("fetch-timeline").style.display = "none";
  document.getElementById("source-chart").innerHTML = null;
  document.getElementById("read-count").innerHTML = "Received retweets and likes:";

  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response_str = this.responseText;
      var timeline = JSON.parse(response_str);
      _timeline["user"] = user;
      _timeline["timeline"] = timeline;

      // Add embed codes
      if (timeline) {
        timeline = addEmbeds(timeline);
        
        // Clear the sidebar and show new content
        document.getElementById("tweets").innerHTML = null;
        displayTimeline(timeline);

        // Compute timeline statistics and display in the detail bar.
        fillTimelineDetails(timeline);

        setTimeout(hideLoader, 410);
      }
      else {
        setMessage("Strange, couldn't find any tweets to display.");
      }
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


/************************************************************************
* Show tweets *
**************/

/* Draw a map marker to each tweet in tweetData and embed them to the sidebar.
Arg:
  tweetData (Object): a JSON encoded response from Twitter search API.
*/
function displayTweets(tweetData) {
  // Don't add anything if we are currently in a different mode
  if (mode != "locator") {
    return;
  }

  if (!tweetData || tweetData.length == 0) {
    // Empty the sidebar and display a message to the user
    setMessage("No tweets found near this location.");
    return;
  }
  
  for (i=0; i<tweetData.length; i++) {
    tweet = tweetData[i];
    var user_id = tweet["user"]["id_str"];
    var screen_name = tweet["user"]["screen_name"];
    var label;
    var color;

    // Log tweet url for debugging purposes
    var url = "http://twitter.com/" + tweet["user"]["screen_name"] + "/status/" + tweet["id_str"];

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
    }

    //  2 Geocode a location and place marker
    else if (tweet["place"]) {
      var loc = tweet["place"]["full_name"];
      tweet["loc"] = loc;
      color = _markerSettings[1][0];
      label = addToMap(loc, color);
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
      }
    }

      // Embed the tweet to the sidebar
      addTweetToSideBar(tweet, label, color);
  }
    // Force tweet renderin by manually loading widget.js
    // (otherwise tweets remain as blockquotes for some reason)
    twttr.widgets.load(document.getElementById("tweets"));
}

/* Embed a users timeline to the sidebar and show tweets on the map.
A modified version of displayTweets().
Args:
  timeline (Object): a JSON encoded list of tweets in the timeline as returned by the API
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
      <ul><li style=\"font-size: 22px\">" + timeline.error + "</li></ul>\
      <p class=\"error\"><a href=\"" + url + "\">@" + user + "</a> Might be a private account.</p>";
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

  // Display user defined location on the map (only once, no label)
  var pan = true;
  var label;
  var userLoc = timeline[0]["user"]["location"];
  var screen_name = timeline[0]["user"]["screen_name"];
  var color = _markerSettings[2][0];
  // Check if the user has set a location
  if (!userLoc) {
    userLoc = "NA";
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
  //showTweet(timeline[0]);

  twttr.widgets.load(document.getElementById("tweets"));
}

/* Embed a tweet to the sidebar by creating a new <div> element for
the tweet and its metadata.
Args:
  tweet (Object): a JSON encoded tweet object as returned by Twitter
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
    showTweet(tweet);
    document.getElementById("tweet-card-header").innerHTML = "Selected tweet";
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

/************************************************************************
* Lower bar timeline details *
******************************/

/* Given a list of breakpoints initialize an empty distibution
for tweet entities in a timeline.
createDistribution([0, 1, 3]) => {"0": 0, "1": 0, "3": 0, "4":0}
with the partitions being {0}, {1}, {2, 3}, {4, ...}
Arg:
  breakpoints (array): the right side breakpoints to the partitions for the distribution.
*/
function createDistribution(breakpoints) {
	var p = {}

	// sort breakpoints
	breakpoints.sort(function(a, b) {
		return a-b;
	});

	for (var i=0; i<breakpoints.length; i++) {
		p[breakpoints[i]] = 0;
	}
	
	var key = breakpoints[breakpoints.length-1] + 1;
	p[key] = 0;
	return p;
}

/* Given a partition and a count of entities found in a tweet,
Returns the right limit of the partition it belongs to.
Args:
  count (int): a value whose partition is to be found
  distribution (array): a distribution as initialized by createDistribution()
*/
function getPartition(count, distribution) {
	// parse the distribution keys to int and sort
	var keys = Object.keys(distribution);
	keys = keys.map(function(num) { return parseInt(num) });
	keys.sort(function(a, b) {return(a-b)});

	for (var i=0; i<keys.length-1; i++) {
		if (count <= keys[i]) {
			return keys[i];
		}
	}

	// if none of the above matched, count belongs to the last partition
	return keys[keys.length-1];
}


/* Compute statistics on recent tweets from a timeline. Attributes to consider:
	1. total number of likes + RTs received,
	2. tweet source distribution,
	3. number of tweets with media
    Note: the "media" entity includes media uploaded with Twitter Photo Upload feature.
    media can also show up as urls, such as YouTube links)
	4. hashtag/mentions/url distributions
	5. emoji usage
Arg:
  timeline (Array): a timeline of tweets as fetched in fetchTimeLine()
*/
function computeTimelineDetails(timeline) {
  var likes = 0;
  var rts = 0;
  var sources = {};
  var hashtags = {};
  var mentions = {};
  var urls = {};
  var mediaCount = 0;
  var emojiCount = 0;
  var badLanguageCount = 0;

  /* Append an element to a counter.
  Args:
    container (Object): an associative array for elements to keep count of
    key (string): the key to add or increment.
  */
  function incrementKey(container, key) {
    if (key in container) {
      container[key] += 1;
    }
    else {
      container[key] = 1;
    }
  }

  // Init lists for various entity frequencies in timeline
  var lengthsFreq = createDistribution([56, 92, 140]); //  n*140/3 for tweet lengths
	var mentionsFreq = createDistribution([0, 1, 3]); 	// [0], [1], [2,3], (3, )
	var hashtagFreq = createDistribution([0, 1, 3]); 
	var urlFreq = createDistribution([0, 1, 3]);

  for (var i = 0; i < timeline.length; i++) {
    // likes and RTs
    var tweet = timeline[i];
    likes += tweet["favorite_count"];
    rts += tweet["retweet_count"];

    // Find tweet length and update timeline frequency
		var idx = getPartition(tweet["text"].length, lengthsFreq);
		lengthsFreq[idx] += 1;

    // Update tweet source stats
    var source = tweet["source"];
    incrementKey(sources, source);
    
    // User mentions: update frequnecy
    var entityMentions = tweet["entities"]["user_mentions"];
		var idx = getPartition(entityMentions.length, mentionsFreq);
		mentionsFreq[idx] += 1;

		// update timeline total mentions stats (ie. who mentioned, how many times)
    for (var j = 0; j < entityMentions.length; j++) {
      var mention = entityMentions[j]["screen_name"];
      if (mention) {
        incrementKey(mentions, mention);
      }
    }

    // Hashtags
    var entityHashtags = tweet["entities"]["hashtags"];
		var idx = getPartition(entityHashtags.length, hashtagFreq);
		hashtagFreq[idx] += 1;

    for (var j = 0; j < entityHashtags.length; j++) {
      var hashtag = entityHashtags[j]["text"];
      if (hashtag) {
        incrementKey(hashtags, hashtag);
      }
    }

    // urls
		var entityUrls = tweet["entities"]["urls"];
		var idx = getPartition(entityUrls.length, urlFreq);
		urlFreq[idx] += 1;

    for (var j = 0; j < entityUrls.length; j++) {
      var url = entityUrls[j]["display_url"];
      if (url) {
        // split by "/" to get the domain name
        url = url.split("/")[0];
        incrementKey(urls, url);
      }
    }

    // increment media counter (accounts only 1 media per tweet)
    if ("media" in tweet["entities"]) {
      mediaCount++;
    }

		// increment emoji counter (only 1 per tweet)
    var emojis = stringToEmojiArray(tweet["text"]);
    if (emojis.length) {
      emojiCount++;
    }

    // tweet semantics:
    // mark tweet as bad language if any of the following
    // * includes any of "dis", "dat", "cuz", "lol", "omg", "lmfao", note: works mostly only on english tweets
    // * no punctuation
    // * no capitalization
    var words = tweet["text"].split(" ");
    // filter out entities
    words = words.filter(function(word) {
      return !word.startsWith("http") && !word.startsWith("@") && !word.startsWith("#");
    });
    if (words.length) {
      var noEntities = words.join(" ");  // orignal text without entities
      // map to lowercase for comparison purposes
      var lower = words.map(function(word) {
        return word.toLowerCase();
      });
      //var lowerJoined = lower.join(" ");

      // punctuation check
      var noPunctuation = containsTokens(noEntities, [".", ",", "!", "?"]);
      var lol = containsTokens(lower, ["dis", "dat", "cuz", "lol", "omg", "lmfao", "u", "bro"]);
      var noCapitalization = (noEntities == noEntities.toLowerCase());

      if (noPunctuation || lol || noCapitalization) {
        badLanguageCount++;
      }
    }
  }

  var stats = {
    "likes": likes,
    "rts": rts,
    "sources": sources,
    "hashtags": hashtags,
    "mentions": mentions,
    "urls": urls,
		"counts": {
			"media": mediaCount,
			"emoji": emojiCount,
      "badLanguage": badLanguageCount,
			"lengthFreq": lengthsFreq,
			"hashtagFreq": hashtagFreq,
			"mentionsFreq": mentionsFreq,
			"urlFreq": urlFreq
		}
  }

  return stats;
}

/* Create an idealized stat vector to the timeline. Compare it to
 each tweet in the timeline using dot product to it to find the most typical tweet.
 (ie. the one with highest dp value).
The stat vector is determined by the timeline's:
	1 tweet length distribution
	2 hashtag/mention/url distribution
	3 media and emoji majority in twets
*/
function findTypicalTweet(timeline, stats) {

  // Create binary values from tweet entity counts:
  // if > threshold % of tweets have occurances in any entity type, set typical component value to 1
  var threshold = 0.5 * timeline.length;
  var media = (stats["counts"]["media"] > threshold) ? 1 : 0;
  var emoji = (stats["counts"]["emoji"] > threshold) ? 1 : 0;
  var badLanguage = (stats["counts"]["badLanguage"] > threshold) ? 1 : 0;

  /* Find the index with highest value in an entity distribution.
  Arg:
    distribution (string): the name of a distribution whose mode to determine.
    One of the keys to stats["count"]
  */
  function getMode(distribution) {
    var mode;
    var maxCount = 0;
    for (p in stats["counts"][distribution]) {
      if (stats["counts"][distribution][p] > maxCount) {
        maxCount = stats["counts"][distribution][p];
        mode = p;
      }
    }
    return parseInt(mode);
  }

  /* Normalize a numeric vector a unit length in place.
  Arg:
    vec (array): the vector to normalze as a numeric array
  */
  function normalize(vec) {
    var geomLength = 0;
    for (var i = 0; i < vec.length; i++) {
      geomLength += Math.pow(vec[i], 2);
    }
    geomLength = Math.sqrt(geomLength);

    if (geomLength != 0) {
      for (var i = 0; i < vec.length; i++) {
        vec[i] /= geomLength;
      }
    }
  }

  /* Compute dot product between 2 vectors.
  Args:
    vec1/vec2 (array): the vectors whose dot product to compute.
    normalizeVectors (boolean): whether the vectors should be normalized to unit length before
      taking the dot product.
  */
  function dot_product(vec1, vec2, normalizeVectors = false) {
    if (vec1.length != vec2.length) {
      throw "Dot product error: vectors are not same size";
    }

    if (normalizeVectors) {
      normalize(vec1);
      normalize(vec2);
    }

    var dp = 0;
    for (var i = 0; i < vec1.length; i++) {
      dp += vec1[i] * vec2[i];
    }
    return dp;
  }

  // Map tweet lengths to [0,1,2] to prevent large values from dominating the dot product
  var lengthMode = getMode("lengthFreq");
  if (lengthMode <= 56 ) { lengthMode = 0; }
  else if (lengthMode <= 92) { lengthMode = 1; }
  else { lengthMode = 2; }
  var hashtagMode = getMode("hashtagFreq");
  var mentionMode = getMode("mentionsFreq");
  var urlMode = getMode("urlFreq");

  // create the mode vector for the timeline
  var modeVector = [lengthMode, hashtagMode, mentionMode, urlMode, media, emoji, badLanguage];
  // Add 1 to all values to prevent 0s in the vector from not affecting the dot product
  // ie. tweet length mode == 0 => the length component will be 0 regardless of the tweet to compare to. 
  modeVector = modeVector.map(function(val) {return val + 1});


  // Compare all tweets in the timeline to the mode vector.
  dps = [];
  var max = 0;
  var typical;
  for (var i = 0; i < timeline.length; i++) {
    var tweet = timeline[i];
    var text = tweet["text"];

    // cheack for emojis and media
    var media = ("media" in tweet["entities"]) ? 1 : 0;
    var emoji = (stringToEmojiArray(text).length) ? 1 : 0;

    // language check
    var words = text.split(" ");
    words = words.filter(function(word) {
      return !word.startsWith("http") && !word.startsWith("@") && !word.startsWith("#");
    });
    var badLanguage = 0;
    if (words.length) {
      var noEntities = words.join(" ");  // orignal text without entities

      var lower = words.map(function(word) {  // without entitties in lowercase array
        return word.toLowerCase();
      });

      var noPunctuation = containsTokens(noEntities, [".", ",", "!", "?"]);
      var lol = containsTokens(lower, ["dis", "dat", "cuz", "lol", "omg", "lmfao", "u", "bro"]);
      var noCapitalization = (noEntities == noEntities.toLowerCase());

      badLanguage = (noPunctuation || lol || noCapitalization) ? 1 : 0;
    }

    // tweet length
    var length = getPartition(text.length, stats["counts"]["lengthFreq"]);
    if (length <= 56 ) { length = 0; }
    else if (length <= 92) { length = 1; }
    else { length = 2; }

    // hashtags/mentions/urls
    var hashtagCount = tweet["entities"]["hashtags"].length;
    var hashtag = getPartition(hashtagCount, stats["counts"]["hashtagFreq"]);

    var mentionCount = tweet["entities"]["user_mentions"].length;
    var mention = getPartition(mentionCount, stats["counts"]["mentionsFreq"]);

    var urlCount = tweet["entities"]["urls"].length;
    var url = getPartition(urlCount, stats["counts"]["urlFreq"]);

    var statVector = [length, hashtag, mention, url, media, emoji, badLanguage];
    statVector = statVector.map(function(val) {return val + 1});

    var dp = dot_product(modeVector, statVector, true);
    dps.push(dp);

    if (dp > max) {
      max = dp;
      typical = tweet;
    }
  }

  return typical;
}


/* Fill retweets+likes received, tweet source chart and a table of
entities used in the timeline to the detail bar.
Arg:
  timeline (array): a timeline as a list of tweet objects.
*/
function fillTimelineDetails(timeline) {
  var stats = computeTimelineDetails(timeline);
  var typical = findTypicalTweet(timeline, stats);
  showTweet(typical);
  createSourceChart(stats["sources"]);

  // Fill headers
  var likes = formatThousands(stats["likes"] + stats["rts"]);
  document.getElementById("tweet-card-header").innerHTML = "Typical tweet";
  document.getElementById("read-count").innerHTML = "Received retweets and likes: " + likes;
  document.getElementById("tweet-count").innerHTML = timeline.length;

  /* Reduce a stat entity object to their top3 (or top <= 3) elements.
  Arg:
    entity (Object): a key, count indexed hashtag, user mention or url data*/
  function top3(entity) {
    var data = [];

    for (var key in entity) {
      var count = entity[key];
      data.push([key, count]);
    }


    data.sort(function(a, b) {
      return b[1] - a[1];
    });

    data = data.slice(0, 3); // get top 3 elements
    data = data.filter(function(item) {
      return item[1] > 1;
    });

    return data;
  }

  var entityTable = document.getElementById("entity-table");
  var empty = true;
  for (var i = 0; i < 3; i++) {
    var row = document.createElement("tr");

    var tags = top3(stats["hashtags"]);
    var mentions = top3(stats["mentions"]);
    var urls = top3(stats["urls"]);

    var hash = "";
    var mention = "";
    var url = "";
   
    // Check if any of entities actually exist
    if (tags[i]) {
      hash = "<a href=\"https://twitter.com/hashtag/" + tags[i][0] + "?src=hash\">#" + tags[i][0] + "</a> " + tags[i][1];
    }
    if (mentions[i]) {
      mention =  "<a href=\"https://twitter.com/" + mentions[i][0] + "\">@" + mentions[i][0] + "</a> " + mentions[i][1];
    }
    if (urls[i]) {
      url = "<a href=\"https://" + urls[i][0] + "\">" + urls[i][0] + "</a> " + urls[i][1];
    }

    row.innerHTML = "<td>"+hash+"</td><td>"+mention+"</td><td>"+url+"</td>";
    if (row.innerHTML != "<td></td><td></td><td></td>") { empty = false }
    entityTable.appendChild(row);
  }

  //
  if (empty) {
    entityTable.rows[1].cells[1].innerHTML = "No multiples detected";
  }

}


/* Show tweet and user info on the lower bar.
Arg:
  tweet (Object): a tweet object as returned by Twitter API*/
function showTweet(tweet) {
  var embed = tweet["embed"];
  var screen_name = tweet["user"]["screen_name"];
  
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

  // Show questionmarks for "read-count" and "source-chart" and the "fetch-timeline" button
  if (_timeline["user"] != screen_name) {
    document.getElementById("read-count").innerHTML = "Received retweets and likes: <img src=\"./img/questionmark.png\" alt=\"questionmark\" height=\"22\">";
    document.getElementById("source-chart").innerHTML = "<img src=\"./img/questionmark.png\" alt=\"questionmark\" height=\"100\" style=\"padding-left:20%\">";
    document.getElementById("fetch-timeline").style.display = "block";
  }


  // Embed tweet without media or thread data, 
  // See https://dev.twitter.com/web/embedded-tweets
  var cutEmbed = embed.replace("<blockquote class=\"twitter-tweet\" ", "<blockquote class=\"twitter-tweet\" data-cards=\"hidden\" data-conversation=\"none\" ");
  var tweetCard = document.getElementById("tweet-card");
  tweetCard.innerHTML = cutEmbed;
  
  // Load Twitter widget to render the tweet
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
  document.getElementById("read-count").innerHTML = "Received retweets and likes:";
  document.getElementById("tweet-count").innerHTML = "n";

  // Entity table
  var cells = document.getElementsByTagName("td");
  for (var i = 0; i < cells.length; i++) {
    cells[i].innerHTML = null;
  }

  // "Fetch timeline" button in the stats section
  document.getElementById("fetch-timeline").style.display = "none";

  // Source chart
  document.getElementById("source-chart").innerHTML = null;
  document.getElementById("fetch-timeline").style.display = "none";

  // Help message for typical tweet
  document.getElementById("tweet-card-help").style.display = "none";
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

/* Add a marker to an address on the map. Use checkAddress to determine if the
address matches a known address or whether it should be geocoded.
Args:
  address (string): the address where a marker should be placed
  color (string): marker color, should be one of those in _markerSettings
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

/* Check if an address matches a previously seen address.
Arg:
  address (string): the address to check 
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
      return _uaddress[i];
    }
  }
}

/* Geocode a string address to a LatLng object and place a marker on it.
Args:
  address (string): the address to geocode
  label (string): a single character label for the marker to place
  color (string): marker color, should be one of those in _markerSettings
  pan (boolean): whether the map should pan to the marker
*/
function codeAddress(address, label, color, pan = false) {
  geocoder.geocode( { 'address': address}, function(results, status) {
    if (status == 'OK') {
      // Geocoding may return more than 1 result, use the first one.
      var latLng = results[0].geometry.location;
      // Note that due to the asynchronous nature of this function,
      // messages will appear out of synch in the log.
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
  label (string): a single character to use as a label for the marker
  color (string): marker color, should be one of those in _markerSettings
  pan (boolean): whether the map should pan to the marker
*/
function placeMarker(location, label, color, pan = false) {
  // Add a map marker to the given coordinates
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




