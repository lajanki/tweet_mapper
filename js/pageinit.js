/* Functions for initializing the page and for some general, non page
mode dependant, functions */

var map;
var geocoder;
var mode;

/************************************************************************
* Page initialization *
***********************/

/* Initialize the page: set control bar event listeners, load the help message and show the map.
Only called when page loads.*/
function init() {
  mode = "locator";
  about();
  initMap();
  initTrendChart();
  
  // Google charts loader
  google.charts.load('current', {'packages':['corechart', 'geochart', 'bar']});
  
  var searchbox = document.getElementById("searchbox");
  searchbox.addEventListener("keydown", getUserValue);

  // Get the first n-1 children of the control bar and add
  // listeners for changing mode.
  /*
  Why doesn't this work???
  var controlBar = document.getElementById("app-control");
  for (var i = 0; i < controlBar.children.length-1; i++) {
  	// Read the mode name from the "name" attribute of the button
    var child = controlBar.children[i];
  	var thisMode = child.getAttribute("name");
  	child.addEventListener("click", function() {
  		setMode(thisMode);
  	});
  }
  */

  // ^ Fine, let's do it this way...
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
}

/* Create the map and initialize it to Tweet locator. */
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

    // Fetch tweets and display the loader
    fetchTweets(lat, lng);
  });
}

/* Set/unset map elements and event listeners based on the current mode. */
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

    // Set map height to match the 27% height of tweet detail bar
    //document.getElementById("map").style.height = "73%";
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

    // Format GET parameters and a send a request to fetch_trends.php in order to
    // draw the geochart
    var params = formatParams({"loc": "Worldwide"});
    getTrends(params, displayTrendChart);



    // trend bar has height 37%
    //document.getElementById("map").style.height = "60%";


	}
}



/************************************************************************
* Helper functions *
*******************/

/* Add an entry to geo.db */
function dbAdd(address, lat, long) {
  console.log("Adding " + address + ": " + "(" + lat + ", " + long + ") to db");
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    console.log(this.readyState);
    if (this.readyState == 4 && this.status == 200) {
      var response_str = this.responseText;
      console.log("success!");
      console.log(response_str);
    }
    else if (this.readyState == 4 && this.status != 200) {
      console.log("HIP!");
    }
    xmlhttp.open("GET", "./geolocate_db.php?loc=" + address + "&lat=" + lat + "&long=" + long, true);
    xmlhttp.send();
  }
}


/* Return the marker label for this tweet. Tweets from the same
user should have the same label. */
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
      <p class=\"about\">Click on the map to search for tweets near that location or use the searchbar to plot a user's latest timeline.</p>\
      <h3 class=\"about\">Help</h3>\
      <p class=\"about\">Twitter stores 3 kinds of location data:\
      <ol>\
        <li><b>Coordinates</b> Individual tweets can be tagged with coordinates of where the tweet was sent. This is the most accurate type of location data available, but requires that the user has set this feature on from his/her Twitter account.\
        </li>\
        <li><b>Place</b> Users can add a separate place attribute to their tweets to let others know that their tweet is either coming from a specific place or is about a place.\
        </li>\
        <li><b>Location</b> Users can also set a fixed location on their Twitter page as their place of residence. This is the least accurate type of location data as all tweets share the same value and it need not be a real place. Ambiguous locations may get located to the wrong place.\
        </li>\
      </ol>\
      </p>\
      <p class=\"about\">Once displayed, click <img src=\"http://maps.google.com/mapfiles/marker.png\" alt=\"marker icon\" height=\"28\"> to\
      show tweet details and <img src=\"./img/location-map-marker-icons_red.png\" alt=\"timeline icon\" height=\"28\"> to\
      show timeline details on the lower bar.</p>\
      <img src=\"./img/tweet_example.png\" alt=\"example result\" width=\"320\" style=\"margin-left: 20px\">";
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
  clearMarkers();
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
function truncate(str, len = 16) {
  if (!str) {
    return "NA";
  }
  var s = str;
  if (s.length > len) {
    s = s.substring(0, len - 3) + "...";
  }
  return s;
}

/* Validate a Twitter username. */
function validTwitteUser(screen_name) {
    return /^[a-zA-Z0-9_]{1,15}$/.test(screen_name);
}