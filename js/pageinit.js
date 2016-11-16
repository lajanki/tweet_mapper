/* Functions for initializing the page and some general, non page
mode dependant, functions

16.11.2016
*/

var map;
var geocoder;
var mode;

/************************************************************************
* Page initialization *
***********************/

/* Initialize the page: set control bar event listeners, load the help message and show the map.
Only called when page loads.
Wrapped in window.onload to prevent Google map loader in index.html from calling before
this script is loaded.*/
function init() {
  window.onload = function() {
    mode = "locator";
    about();
    initMap();

    // Call Google charts loader and initialize a geochart for displaying trending data.
    google.charts.load('current', {'packages':['corechart', 'geochart', 'line']});
    google.charts.setOnLoadCallback(initTrendChart);
   
    
    var searchbox = document.getElementById("searchbox");
    searchbox.addEventListener("keydown", getUserValue);

    // Add event listeners to the control buttons on top of the map
    var locatorButton = document.getElementById("locator-button");
    locatorButton.addEventListener("click", function() {
      if (mode != "locator") {
        setMode("locator");
      }
    });

    var trendsButton = document.getElementById("trends-button");
    trendsButton.addEventListener("click", function() {
      if (mode != "trends") {
        setMode("trends");
      }
    });

    var aboutButton = document.getElementById("about-button");
    aboutButton.addEventListener("click", about);

    // Set event listener to "fetch-timeline" button in the lower bar:
    // most recently selected users timeline and hide the button
    var button = document.getElementById("fetch-timeline");
    button.addEventListener("click", function() {
      button.style.display = "none";
      // Read the user whose tweets is currently shown in the details bar
      var user = document.getElementById("username").text.substring(1); // // exclude the "@"
      // Clear previous data
      showLoader();
      clearDetails();
      requestFile("./php/fetch_tweets.php", "?user="+user, processTimeline);
    });

    // Event listener to showing typical tweet help window.
    button = document.getElementById("typical-help-button");
    button.addEventListener("click", function() {
    	document.getElementById("tweet-card-help").style.display = "block";
    });

    // ...and for closing it
    button = document.getElementById("close");
    button.addEventListener("click", function() {
    	document.getElementById("tweet-card-help").style.display = "none";
    });
  }
}


/* Create a Google Maps object and page control elements to attach to it.
Add an event listener to the map for findind tweets near the clicked coordinates. */
function initMap() {
  // Create a map object and add it to the "map" div
  map = new google.maps.Map(document.getElementById("map"), {
    center: {lat: 24.485472, lng: 12.542320},
    zoom: 3,
    scaleControl: true,
    draggableCursor: "default"
  });
  geocoder = new google.maps.Geocoder();

  // Add searchbox and the legend to the map
  var input = document.getElementById("searchbox");
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(input);  

  var legend = document.getElementById("legend");
  for (i = 0; i < _markerSettings.length; i++ ) {
    var div = document.createElement("div");
    div.innerHTML = "<img src=\"http://maps.google.com/mapfiles/marker" + _markerSettings[i][0] + ".png\"> " + _markerSettings[i][1];
    legend.appendChild(div);
  }
  map.controls[google.maps.ControlPosition.RIGHT_CENTER].push(legend);

  // Add page control bar
  var controlBar = document.getElementById("app-control");
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(controlBar);
  
  // Add a small delay to displaying map controls to let the map render first
  setTimeout(function() {
    input.style.display = "block";
    legend.style.display = "block";
    controlBar.style.display = "block";
  }, 500);


  // Add a click event listener for finding tweets
  map.addListener('click', function(event) {

    map.panTo(event.latLng);
    // round coordinates to 4 decimal places:
    // (also converts to string, but that happens later anyway)
    var lat = event.latLng.lat().toFixed(4);
    var lng = event.latLng.lng().toFixed(4);

    // Show the loader, clear previous data and fetch new tweets.
    // The loader will be hidden wihtin processTweets.
    showLoader();
    clearDetails();
    requestFile("./php/fetch_tweets.php", "?lat="+lat+"&lng="+lng, processTweets);
  });
}

/* Create a Google GeoChart object to display trending data. Add event listeners for
 trend searchbox and displaying a list of a country's trends. Finally, fetch all
 countries with trending data available via fetch_trends.php and draw them on the chart.*/
function initTrendChart() {
  // Define global geochart options.
  var options = {
    width: 1450,
    height: 625,
    keepAspectRatio: false,
    defaultColor: "518E4B",
    backgroundColor: "#91CEF3"
  }

  // Store a global reference to a single chart object and drawing options.
  // These are not modified after setup.
  var chart = new google.visualization.GeoChart(document.getElementById("geochart"));
  _geoChart["chart"] = chart;
  _geoChart["options"] = options;

  // Add event listener to trend search box
  var searchbox = document.getElementById("trend-search-overlay");
  searchbox.addEventListener("keydown", queryTrendingCountries);

  // Event listener for "worldwide" button: draw the chart with worldwide data
  // and list trends with tweet volume on the sidebar.
  var worldwide = document.getElementById("worldwide-overlay");
  worldwide.addEventListener("click", function() {
    drawChart(_geoChart["default"]);
    requestFile("./php/fetch_trends.php","?loc=Worldwide", listTrends);
  });

  // Event listener to the chart: get the selected country and draw a list of trends to the sidebar.
  google.visualization.events.addListener(chart, "select", function() {
    var selection = chart.getSelection()[0].row;  // row index of the selected value, silently throws TypeError if not a valid selection
    var country = _geoChart["data"].getValue(selection, 0); // row, col indices matching the selected country in data
    //console.log(country);

    requestFile("./php/fetch_trends.php","?loc="+country, listTrends);
  });

  // Draw the chart with all countries where trending data is available.
  requestFile("./php/fetch_trends.php", "?fetch_all", function(countries) {
    _geoChart["default"] = countries;  // store the list of drawable countries
    drawChart(countries);
  });
}

/* Set/unset map elements and event listeners based on the current mode.
Arg:
  newMode (string): name of the mode to change to, ie. "locator"/"locator"
*/
function setMode(newMode) {
  mode = newMode;  // chnage the global mode variable
  about();
  //console.log("current mode: " + mode);

  // Change control bar font emphases
  var controlBar = document.getElementById("app-control");
  for (var i = 0; i < controlBar.children.length-1; i++) {
    var button = controlBar.children[i];
    button.style.fontWeight = 300;
    if (button.getAttribute("name") == newMode) {
      button.style.fontWeight = "bold";
    }
  }

	if (newMode == "locator") {
    // Show the map and hide the geochart
    document.getElementById("map").style.display = "block";
    document.getElementById("geochart-container").style.display = "none";

    // Attach the control bar to the map
    var control = document.getElementById("control-overlay");
    control = control.removeChild(control.childNodes[0]);
    map.controls[google.maps.ControlPosition.TOP_CENTER].push(control);

    // Display tweet detail bar at the bottom
    document.getElementById("detail-bar").style.display = "block";
    document.getElementById("trends-bar").style.display = "none";

    // Set detail bar tweet header to initial value
    document.getElementById("tweet-card-header").innerHTML = "Selected/Typical tweet";
	}

	else if (newMode == "trends") {
    // Show the geochartand hide the map.
    document.getElementById("map").style.display = "none";
    document.getElementById("geochart-container").style.display = "block";

    // Attach the control bar to the geochart's overlay
    var control = map.controls[google.maps.ControlPosition.TOP_CENTER].removeAt(0);
    document.getElementById("control-overlay").appendChild(control);

    // Switch the bottom bar to trends bar
    document.getElementById("trends-bar").style.display = "block";
    document.getElementById("detail-bar").style.display = "none";

    // Fetch trending data from treds.db to draw a history chart.
    requestFile("./backend/trends.php", "?latest=true&n=7", getLatestTrends);
	}
}


/************************************************************************
* Helper functions *
*******************/

/* Generic AJAX function to send a GET request to the specified url with callback.
Args:
  url (string): path to the script to call
  params (string): formatted GET params to append to the url, including ? at the beginning
  callback (function): function to call with the AJAX response as a parameter
*/
function requestFile(url, params, callback) {
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response = JSON.parse(this.responseText);
      callback(response);
    }
    else if (this.status == 500) {
      setMessage("Something went wrong :( The server encoutered an internal error with the following message:<br/>" +
        this.statusText + "<br/>Try again.");
    }
  }
  xmlhttp.open("GET", url + params, true);
  xmlhttp.send();
}


/* Return the marker label for this tweet. Tweets from the same
user should have the same label.
Arg:
  key (string): a key to _labels, either a marker label or an address that was geocoded.
*/
function getLabel(key) {
  // If labels is empty, add this key as "A"
  // and return the label
  key = key.toLowerCase();
  if (Object.keys(_labels).length == 0) {
    _labels[key] = "A";
    _labels["latest"] = "A";
    return "A";
  }

  // Check if this key is already in labels
  if (key in _labels) {
    return _labels[key];
  }

  // Add this key to the labels.
  // Get the next free label available,
  // Valid label range is A - Z (charcodes 65 - 90)
  var OFFSET = "A".charCodeAt();
  var charcode = _labels["latest"].charCodeAt(0);
  // Compute charcode for the next label via a linear transformation to [0, 25]
  var nextCharcode = ((charcode - OFFSET + 1) % 26)  + OFFSET;
  var label = String.fromCharCode(nextCharcode);

  // Add new entry to labels and return the label
  _labels[key] = label;
  _labels["latest"] = label;
  return label;
}

/* Empty the sidebar and display a message on it.
Args:
  message (string): the message to display
  html (boolean): whether the message is html tagged. If not, it will be wrapped in a <p> tag.
*/
function setMessage(message, html = false) {
  // Hide the loader in case it's currently displayed
  hideLoader();

  if (html) {
    var msg = message;
  }
  else {
    var msg = "<p class=\"error\">" + message + "</p>";
  }
  document.getElementById("tweets").innerHTML = msg;
}

/* Set the sidebar to display the loading animation. */
function showLoader() {
  document.getElementById("tweets").style.display = "none";
  document.getElementById("loader").style.display = "block";
}

/* Hide the loader and display data */
function hideLoader() {
  document.getElementById("tweets").style.display = "block";
  document.getElementById("loader").style.display = "none";
}

/* Display usage info on the sidebar. Defaults to tweet locator info. */
function about() {
  // Set about text based on current mode (ie. which tab is displayed)
  var msg;
  if (mode == "locator") {
    msg = "<h2 class=\"about\">Tweet mapper</h2>\
      <p class=\"about\">Click on the map to search for tweets near that location or use the searchbar to show a user's recent timeline.</p>\
      <h3 class=\"about\">Help</h3>\
      <p class=\"about\">Twitter stores 3 kinds of location data:\
      <ol>\
        <li><b>Coordinates</b> Individual tweets can be tagged with coordinates of where the tweet was sent.\
        	This is the most accurate type of location data available, but requires that the user has set this feature on\
        	from his/her Twitter account.\
        </li>\
        <li><b>Place</b> Users can add a separate place attribute to their tweets to let others know that their tweet is either\
        	coming from a specific place or is about a place.\
        </li>\
        <li><b>Location</b> Users can also set a fixed location on their Twitter page as their place of residence.\
        	This is the least accurate type of location data as all tweets share the same value and it need not be a real place.\
        	Additionally, ambiguous locations may get located to the wrong place.\
        </li>\
      </ol>\
      </p>\
      <p class=\"about\">Once tweets are displayed, click <img src=\"http://maps.google.com/mapfiles/marker.png\" alt=\"marker icon\" height=\"28\"> to\
      show tweet details and <img src=\"./img/location-map-marker-icons_red.png\" alt=\"timeline icon\" height=\"28\"> to\
      show timeline details on the lower bar. For compatible tweet languages <img src=\"./img/speaker.png\" alt=\"timeline icon\" height=\"28\">\
      provides a text-to-speech option.</p>\
      <img src=\"./img/tweet_example2.png\" alt=\"example result\" width=\"320\" style=\"margin-left: 20px\">\
      <hr/>\
      <div class=\"about\" style=\"width:300px;vertical-align:top;font-family: Arial;font-size:9pt;line-height: normal\">\
      <a rel=\"license\" href=\"//responsivevoice.org/\"><img title=\"ResponsiveVoice Text To Speech\" src=\"https://responsivevoice.org/wp-content/uploads/2014/08/120x31.png\"\
      style=\"float:left;padding-right:2px\" /></a><span xmlns:dct=\"http://purl.org/dc/terms/\" property=\"dct:title\">\
      <a href=\"//responsivevoice.org/\" target=\"_blank\" title=\"ResponsiveVoice Text To Speech\">ResponsiveVoice</a></span>\
      used under <a rel=\"license\" href=\"http://creativecommons.org/licenses/by-nc-nd/4.0/\"\
      title=\"Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License\">Non-Commercial License</a></div>\
      <div style=\"clear:both;\">&nbsp;</div>";
  }
  else {
    msg = "<h2 class=\"about\">Trend analyser</h2>\
      <p class=\"about\">The map displays the countries for which Twitter has trending topic information available.</p>\
      <h3 class=\"about\">Help</h3>\
      <p class=\"about\">Click on a country to  display a list of currently trending topics in that country.</p>\
      <p class=\"about\">Click on a listed topic to see all countries where that topic is trending or enter a searchterm to the input field.</p>\
      <p class=\"about\">Use the <i>Worldwide</i> button on the map to reset the map back to worldwide data.</p>\
      <p class=\"about\">Trends are listed with icons for opening a Twitter search for that topic\
        <img src=\"./img/Twitter_Logo_Blue.png\" alt=\"Twitter icon\" height=\"28\"> and for opening a search near the current location\
        <img src=\"./img/map-marker.png\" alt=\"map marker\" height=\"28\"></p>\
      <p class=\"about\">Tweet volume is listed for worldwide trend list</p>";
  }

  setMessage(msg, true);
  clearDetails();
  // Remove and re-add the sidebar to restat the anmation
  var tweets = document.getElementById("tweets");
  var newone = tweets.cloneNode(true);
  tweets.parentNode.replaceChild(newone, tweets);
}

/* Formats a number to use " " as a thousands separator. */
function formatThousands(num) {
  if (num) {
    num = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  return num;
}

/* Truncate a string to given length + "...".
Args:
  str (string): the string to truncate
  len (int): the truncated length, including "..."
*/
function truncate(str, len = 20) {
  if (!str) {
    return "NA";
  }
  var s = str;
  if (s.length > len) {
    s = s.substring(0, len - 3) + "...";
  }
  return s;
}

/* Validate a Twitter username.
Return:
  true/false based on whether screen_name was a valid user name.*/
function validTwitteUser(screen_name) {
    return /^[a-zA-Z0-9_]{1,15}$/.test(screen_name);
}

/* Escape html characters. */
function escapeHtml(text) {
  var map = {
    //'&': '&amp;',  //&s are already escaped in the tweet text
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}



/* Format a <blockquote> string which the Twitter widget can render to a proper tweet.
Twitter API's statuses/oembed endpoint only supports fetching one embed code at a time,
fetching 20 embed codes in a loop is too slow.

Notes:
 * Embed codes are of the form
    <blockquote class="twitter-tweet" data-lang="fi"><p lang="en" dir="ltr">[FCM] Ask Uncle Colin: Am I working too hard?: <a href="https://t.co/xfYUN3X71C">https://t.co/xfYUN3X71C</a></p>
    &mdash; Colin Beveridge (@icecolbeveridge) <a href="https://twitter.com/icecolbeveridge/status/788666135843438592">19. lokakuuta 2016</a></blockquote>
    <script async src="//platform.twitter.com/widgets.js" charset="utf-8"></script>
   It appears only the final <a> tag (and the wrapping <blockquote>) linking to the tweet is actually needed for the rendering to work.
   The rest is a shell to display incase rendering doesn't work.
 * This function attempts to mimic the original behaviour.

Transformation rules:
  1 escape html characters
  2 "↵"" => <br>
  3 url => <a href=url>url</a>
  4 #goal => <a href="https://twitter.com/hashtag/goal?src=hash">#goal</a>
  5 @Rsl2278 => <a href="https://twitter.com/Rsl2278">@Rsl2278</a>
  6 media => <a href="[text url: https://t.co/[id]]">pic.twitter.com/[id]</a> (media elements are just before the suffix)
  7 suffix => &mdash; name (@screen_name) <a href="https://twitter.com/screen_name/status/tweet_id">October 19, 2016</a>

  eg:
  formatEmbed("Sieben Fragen, die Putin endlich beantworten muss https://t.co/7rcuvrfcVh https://t.co/1hfKy0PW1Q")

    "<blockquote class="twitter-tweet" data-lang="en"><p lang="de" dir="ltr">Sieben Fragen, die Putin endlich beantworten
    muss <a href="https://t.co/7rcuvrfcVh">https://t.co/7rcuvrfcVh</a> <a href="https://t.co/1hfKy0PW1Q">pic.twitter.com/1hfKy0PW1Q</a></p>
    &mdash; WELT (@welt) <a href="https://twitter.com/welt/status/788699295683870720">October 19, 2016</a></blockquote>"
*/
function formatEmbed(tweet) {
  var text = escapeHtml(tweet["text"]);   // escape html characters
  text.replace("↵", "<br>");
  var split = text.split(" ");

  for (var i = 0; i < split.length; i++) {
    var word = split[i];

    // Check for links, excluding the last word. If last word is an url treat it as picture.
    if (word.startsWith("http")) {
      split[i] = "<a href=\"" + word + "\">" + word + "</a>";
    } 

    // User mentions: link to user page:
    // <a href="https://twitter.com/PanthersTopCats">@PanthersTopCats</a>
    else if (word.startsWith("@")) {
      var screenName = word.substring(1);
      split[i] = "<a href=\"https://twitter.com/" + screenName + "\">" + word + "</a>";
    }

    // Hashtags:
    // <a href="https://twitter.com/hashtag/IndyAMACircleSocial?src=hash">#IndyAMACircleSocial</a>
    else if (word.startsWith("#")) {
      var tag = word.substring(1);
      split[i] = "<a href=\"https://twitter.com/hashtag/" + tag +"?src=hash\">" + word + "</a>";
    }
  }

  /*
  // TODO: media links
  var media_url = "";
  // Check if there are any media related to the tweet
  if ("media" in tweet["entities"]) {
    for (var i = 0; i < tweet["entities"]["media"].length; i++) {
      var item = tweet["entities"]["media"][i];

      //media_url += 
      // url for href,
      // display_url for display value
    }
  }
  */

  // Join the text back to a string
  text = split.join(" ");

  // Format the suffix:
  // &mdash; [name] ([@screen_name]) <a href="https://twitter.com/[screen_name]/status/[tweet_id]">October 19, 2016</a>
  // Get the month name from the timestamp
  var createdAt = tweet["created_at"];
  var monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var d = new Date(createdAt);
  var month = monthNames[d.getMonth()];
  var timestamp = month + " " + d.getDate() + ", " + d.getFullYear();

  var suffix = "</p>&mdash; " + tweet["user"]["name"] + " (@" + tweet["user"]["screen_name"] + ")\
    <a href=\"https://twitter.com/" + tweet["user"]["screen_name"] + "/status/" + tweet["id_str"] + "\">" + timestamp + "</a></blockquote>";

  // Set prefix and data language to english manully
  var prefix = "<blockquote class=\"twitter-tweet\" data-lang=\"en\"><p lang=\"en\" dir=\"ltr\">"
  return prefix + text + suffix;
}

/* Add embed codes to a list of tweet objects.
Arg:
  timeline (array): a list of tweet objects.
*/
function addEmbeds(timeline) {
  for (var i = 0; i < timeline.length; i++) {
    timeline[i]["embed"] = formatEmbed(timeline[i]);
  }
  return timeline;
}

/* Check if a tweet in a list of tweets is a retweet and change it to the parent.
Arg:
  tweets (array): a list of tweet objects.
*/
function traceRetweets(tweets) {
  var ids = [];
  var uniques = [];
  for (var i = 0; i < tweets.length; i++) {
    var tweet = tweets[i];

    if ("retweeted_status" in tweet) {
      tweet = tweet["retweeted_status"];

      // Due to the parent tracing, we may have already seen this tweet.
      // Only add it to the list of tweets if not seen before
      if (ids.indexOf(tweet["id_str"]) == -1) {
        uniques.push(tweet);
        ids.push(tweet["id_str"]);
      }
    }

    // Not a retweet, add to the list of unique tweets
    else {
      uniques.push(tweet);
    }
  }
  return uniques;
}

/* Check if a string contains punctuation characters.
Args:
  s (string): the string to check against
  tokens (array): a list of characters to find in s
*/
function containsTokens(s, tokens) {
  for (var i = 0; i < tokens.length; i++) {
    if (s.indexOf(tokens[i]) != -1) {
      return true;
    }
  }
  return false;
}

/* Check if str is alphanumeric.
Source: http://stackoverflow.com/questions/4434076/best-way-to-alphanumeric-check-in-javascript
*/
function isAlphaNumeric(str) {
  var code, i, len;

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
        !(code > 64 && code < 91) && // upper alpha (A-Z)
        !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;
    }
  }
  return true;
}

/* Check if str contains emojis. Returns a list of
emojis detected.
source: http://stackoverflow.com/questions/24531751/how-can-i-split-a-string-containing-emoji-into-an-array
*/
function stringToEmojiArray(str) {
  split = str.split(/([\uD800-\uDBFF][\uDC00-\uDFFF])/);
  arr = [];
  for (var i=0; i<split.length; i++) {
    char = split[i];
    // drop whitespace and alphanumeric data
    if (char !== "" && !isAlphaNumeric(char) && char.indexOf(" ") == -1) {
      arr.push(char);
    }
  }
  return arr;
}

/* Convert a Twitter language code to format accepted by ResponsiveVoice.JS. */
function langCodeToResponsiveVoiceCode(code) {
  var mapping = [
    ["en", "UK English Female"],
    ["es", "Spanish Female"],
    ["fr", "French Female"],
    ["de", "Deutsch Female"],
    ["nl", "Dutch Female"],
    ["sv", "Swedish Female"],
    ["fi", "Finnish Female"],
    ["no", "Norwegian Female"],
    ["ru", "Russian Female"],
    ["zh", "Chinese Female"],
    ["ja", "Japanese Female"],
    ["hi", "Hindi Female"],
    ["ar", "Arabic Male"],
    ["vi", "Vietnamese Male"],
    ["pt", "Portuguese Female"],
    ["ko", "Korean Female"],
    ["is", "Icelandic Male"],
    ["tr", "Turkish Female"],
    ["sw", "Swahili Male"],
    ["pl", "Polish Female"],
    ["it", "Italian Female"],
    ["hu", "Hungarian Female"],
    ["el", "Greek Female"]
  ]

  // Find item whose first element matches the input.
  for (var i = 0; i < mapping.length; i++) {
    if (mapping[i][0] == code) {
      return mapping[i][1];
    }
  }
  return null;  // no match found

}



/************************************************************************
* Twitter Widget Factory functions *
***********************************/

/* Display a pre-generated timeline, see
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

/* Show a timeline of likes of screenName. */
function factoryLikes(screenName) {
  document.getElementById("tweets").innerHTML = null;

  twttr.widgets.createTimeline({
    sourceType: "likes",
    screenName: screenName
  },
  document.getElementById("tweets"));
}


