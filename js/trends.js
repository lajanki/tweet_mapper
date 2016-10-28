/* Functions for fetching Twitter trends data and displaying it on a 
Google geochart.

TODO: add past trends to the history chart.

28.10.2016
*/



// global object for referencing geochart related data
var _geoChart = {
  "chart": null,
  "data": [],  // current data being displayed
  "default": [],  // all countries with trending data
  "search": "", // previous search term clicked/entered, not URL encoded
  "response": null, // previous response from fetch_trends.php
  "options": {}  // options used to draw the chart

}

// reference to the trend history chart
var  _trendHistoryChart = {
	"chart": null,
	"data": null,
	"options": {}
}


/************************************************************************
* Chart drawing *
****************/

/* Draw a Google geochart for locating trending data of available countries.
Only called once on page load.
Arg:
  locations (array): list of country names to show on the map
*/
function setUpChart(locations) {
  var dataRows = [];
  for (var i = 0; i < locations.length; i++) {
    dataRows.push([locations[i]]);
  }

  var data = google.visualization.arrayToDataTable(dataRows, true);
  _geoChart["data"] = data;

  var chart = new google.visualization.GeoChart(document.getElementById("geochart"));
  google.visualization.events.addListener(chart, "select", function() {
    var selection = chart.getSelection()[0].row;  // row index of the selected value, silently throws TypeError if not a valid selection
    var country = _geoChart["data"].getValue(selection, 0); // row, col indices matching the selected country in data

    // Format GET request parameters and make the request to fetch_trends.php
    var params = formatParams({"loc": country});
    getTrends(params, listTrends);

  });
   var options = {
    width: 1450,
    height: 625,
    keepAspectRatio: false,
    defaultColor: "518E4B",
    backgroundColor: "#91CEF3"
  }

  _geoChart["chart"] = chart;
  _geoChart["options"] = options;

  chart.draw(data, options);
   
}

/* Clear previous data from the geochart and redraw it with new locations.
Args:
	locations (array): list of country names to show on the map
*/
function redrawChart(locations) {
  if (!locations.length) {
    var msg = "<p class=\"error\">No data for <i>" + _geoChart["search"] + "</i></p>";
    setMessage(msg, true);
    return;
  }

  // Redraw the chart
  var chart = _geoChart["chart"];
  var dataRows = [];
  for (var i = 0; i < locations.length; i++) {
    dataRows.push([locations[i]]);
  }

  var data = google.visualization.arrayToDataTable(dataRows, true);
   _geoChart["data"] = data;

  chart.draw(data, _geoChart["options"]);
}

/* Draw linechart for recent trend history.
Args:
	trendData (array): the data to display in the chart as array of rows to pass to DataTable.
	Row format is [timestamp, trend1_volume, trend2_volume, ...].
	columnNames (array): the column names to pass to the DataTable
*/
function drawTrendHistory(trendData, columnNames) {
  var data = new google.visualization.DataTable();

  // Read headers from the first row in trends and create columns for the chart data,
  // columns == trend names
  data.addColumn("string", "time (UTC)");
  for (var i = 0; i < columnNames.length; i++) {
    data.addColumn("number", columnNames[i]);
  }

  data.addRows(trendData);
  _trendHistoryChart["data"] = data;

  var options = {
    chart: {
      title: "Top 10 worldwide trends by tweet volume",
      subtitle: "Recent history of current top trends from the previous 24h as measured every 2 hours."
    },
    height: 450,
    width: "100%",
    legend: {position: 'top', textStyle: {color: 'blue', fontSize: 16}}
  };
  _trendHistoryChart["options"] = options;

  var chart = new google.charts.Line(document.getElementById("trends-bar"));
  _trendHistoryChart["chart"] = chart;
  chart.draw(data, options);
}


/************************************************************************
* AJAX functions and callbacks *
*******************************/

/* Fetch names of countries to draw via fetch_trends.php and
draw the geochart.*/
function initTrendChart() {
  // Add event listener for trend search box
  var searchbox = document.getElementById("trend-search-overlay");
  searchbox.addEventListener("keydown", queryTrendingCountries);

  // Event listener for "worldwide" button: draw map and show trends with tweet volume
  var worldwide = document.getElementById("worldwide-overlay");
  worldwide.addEventListener("click", function() {
    redrawChart(_geoChart["default"]);
    var params = formatParams({"loc": "Worldwide"});
    getTrends(params, listTrends);
  })

  // Draw the chart
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var locations = JSON.parse(this.responseText);
      _geoChart["default"] = locations;

      // Draw the geochart and line chart for trend history on Google library load
      google.charts.setOnLoadCallback(function() {
        setUpChart(locations);
        //getLatestTrends(7);

      });
    }
  }
  xmlhttp.open("GET", "./php/fetch_trends.php?fetch_all", true);
  xmlhttp.send();
}

/* General purpose AJAX function interacting with fetch_trends.php.
Args:
  params (Object): the parameters to pass with the GET request in a key: value form
  callback (function): the function to handle the response
*/
function getTrends(params, callback) {
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response = JSON.parse(this.responseText);
      _geoChart["response"] = response;
      callback(response);
    }
  }
  xmlhttp.open("GET", "./php/fetch_trends.php" + params, true);
  xmlhttp.send();
}

/* Callback to getTrends: display a list of trends in the sidebar.
Args:
  trendData (Object): a trending data object for a specific location as returned by Twitter
  and stored in backend/trend.json.
*/
function listTrends(trendData) {
  var sidebar = document.getElementById("tweets");

  // Create headers for the sidebar: country and timestamp
  var location = trendData["locations"][0]["name"];
  var since = new Date(trendData["as_of"]);
  since = since.toUTCString();

  var msg = "<h3>Trending topics in " + location + "</h3>\
    <h5>As of " + since + "</h5>\
    <h6>Previous 24h in no particular order</h6>";
  if (location == "Worldwide") {
    msg = "<h3>Trending topics " + location + "</h3>\
    <h5>As of " + since + "</h5>\
    <h6>Previous 24h ordered by tweet volume</h6>";
  }
  setMessage(msg, true);


  // Create a list of trends and sort by global tweet volume
  var trends = trendData["trends"];
  trends.sort(function(a, b) {
    return b.tweet_volume - a.tweet_volume;
  });

  var table = document.createElement("table");
  table.id = "trend-table";

  for (var i = 0; i < trends.length; i++) {
    var node = document.createElement("li");
    var url = trends[i]["url"];
    var name = trends[i]["name"];

    // Create an url for tweets near current country using Twitter's "near" search operator.
    // Not very accurate, possibly ignores town names (ie. tweets near London may not
    // show up for tweets near UK?)
    var locUrl = url + encodeURIComponent(" near:"+location);

    // New table row at ith position
    var row = table.insertRow(i);

    // Create <td> elements for trend name, global Twitter link and country Twitter link
    var trendCell = row.insertCell(0);
    var volumeCell = row.insertCell(1);
    volumeCell.className = "volume-cell";
    // Hide volume column for local data
    if (location != "Worldwide") {
      volumeCell.style.display = "none";
    }
    
    var globalCell = row.insertCell(2);
    var localCell = row.insertCell(3);

    // Add tweet volume, this is only visible for "Worldwide" data
    volumeCell.innerHTML = formatThousands(trends[i]["tweet_volume"]);

    // <a> for linking trend name to showing data on the chart
    var a = document.createElement("a");
    var linkTextNode = document.createTextNode(name);
    a.appendChild(linkTextNode);
    a.title = name;
    a.href = "#";

    a.addEventListener("click", function() {
      var q = encodeURIComponent(this.text);
      var params = formatParams({"q": q});
      getTrends(params, showCountries);
    });

    // <img>s for displaying Twitter search results globally and locally
    trendCell.appendChild(a);
    var img = createImgLink("./img/Twitter_Logo_Blue.png", url, 28);
    img.title = "Search in Twitter";
    img.style.paddingRight = "10px";
    globalCell.appendChild(img);

    // local results only for actually local results
    if (location != "Worldwide") {
      img = createImgLink("./img/map-marker.png", locUrl, 20);
      img.title = "Twitter search near " + location;
      localCell.appendChild(img);
    }
  }

  // Attach the table to the sidebar
  sidebar.appendChild(table);
}


/* Callback to getTrends: display top worlwide trends in a Google column chart.
DEPRICATED: replaced by drawTrendHistory()
Args:
  trendData (Object): a trending data object for a specific location as returned by Twitter
  and stored in backend/trend.json.
*/
function displayTrendChart(trendData) {
  // Filter out null values
  var trends = trendData["trends"].filter(function(trend) {
    return trend.tweet_volume;
  });

  // Sort in descending order
  trends.sort(function(a, b) {
    return b.tweet_volume - a.tweet_volume;
  });

  // Filter out the tail
  trends = trends.slice(0, 10);

  // Format a string for trend data start time
  var since = new Date(trendData["as_of"]);
  since = since.toUTCString();

  // Format an array for data to display in the chart
  //var dataPoints = [["Trend", "Tweet volume"]];
  var dataPoints = [];
  var urls = [];  // Extra array for Twitter search url related to a trend
  for (var i = 0; i < trends.length; i++) {
    var name = trends[i]["name"];
    var vol = trends[i]["tweet_volume"];
    var url = trends[i]["url"];
    var row = [name, vol];
    urls.push(url);
    dataPoints.push(row);
  }

  var data = google.visualization.arrayToDataTable(dataPoints, true);
  var location =  trendData["locations"][0]["name"];
  var title = "Top trending topics in " + location;
  if (location == "Worldwide") {
    title = "Top trending topics " + location;
  } 

  google.charts.setOnLoadCallback(function() {
    var options = {
      chart: {
        height: "100%",
        title: title,
        subtitle: "As of " + since
      },
      legend: {position: "none"},
      vAxis: {title: "Tweet Volume"}
    };

    var chart = new google.charts.Bar(document.getElementById("trends-bar"));
    //var chart = new google.visualization.ColumnChart(document.getElementById("trends-bar"));

    // Add event listener for opening a link to Twitter search results
    google.visualization.events.addListener(chart, 'select', function() {
      var selectedItem = chart.getSelection()[0];
      if (selectedItem) {
        var row = selectedItem.row;
        var col = selectedItem.column;
        var name = data.getValue(selectedItem.row, 0);
        var q = encodeURIComponent(name);
        var params = formatParams({"q": q});
        getTrends(params, showCountries);
      }
    });

    chart.draw(data, options);
  });
}


/* Read user input from the trend search bar and perform a search for countries where
that input is trending. */
function queryTrendingCountries(event) {
  // Check for Enter key press
  if (event.which != 13) {
    return;
  }

  var input = document.getElementById("trend-search-overlay").value;
  _geoChart["search"] = input;
  input = encodeURIComponent(input);
  var params = formatParams({"q": input});
  getTrends(params, showCountries);
}

/* Color the countries where q is trending.
Arg:
  countries (array): a list of country names to highlight
 */
function showCountries(countries) {
  redrawChart(countries);
}


/************************************************************************
* Database query functions for recent trend history *
****************************************************/

/* Get the latest n columns from the latest table from the database at ../backend/trends.db.
Arg:
	n (int): number of columns to fetch
*/
function getLatestTrends(n) {
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response = JSON.parse(this.responseText);

      // List the data in the sidebar
      //listWorldwideTrends(response);

      // Transform keys to UNIX timestamps and reformat the data to arrays of
      // [timestamp, trend1, trend2, ...].
      // Use top 10 trends as ordered by the latest measurement.
      var keys = Object.keys(response[0]);
      keys = keys.sort().slice(0, -1);  // keys, without "trend", sorted in alphabetical order (ie. latest timestamp is last)

      // Find the top 10 trends
      var topTrends = [];  // trends as (trend, volume) pairs in the latest column
      for (var i = 0; i < response.length; i++) {
      	var trendSeries = [response[i]["trend"]];   // [trend, col_n, col_(n-1), ..., col_1], col_1 == latest
      	for (var j = 0; j < keys.length; j++) {
      		var volume = parseInt(response[i][keys[j]]);
      		if (volume == 0) { volume = 10000; }
      		else if (volume == -1) { volume = 0; }
      		trendSeries.push(parseInt(volume));
      	}
      	topTrends.push(trendSeries);
  	  }
  	  // sort by volume and cut the tail
  	  topTrends.sort(function(a, b) { return b[n] - a[n]; });
  	  topTrends = topTrends.slice(0, 10);
  	  var trendNames = topTrends.map(function(trend) {return trend[0]; });

  	  // Reformat the data to [timestamp, trend1, trend2, ...].
  	  var rows = [];
  	  var now = new Date();
      for (var i = 0; i < keys.length; i++) {
      	// reformat timestamp to HH:MM using UTC hours.
      	var timestamp = keys[i].split("_")[2];
      	var hour = parseInt(timestamp.slice(0, 2));
      	var hourOffset = now.getUTCHours() - now.getHours();  // hour offset from current local time to UTC time
      	hour += hourOffset;
      	timestamp = hour + ":" + timestamp.slice(2, 4);

      	// Create a trend row to pass to trendHistory()
      	var row = [timestamp];
      	for (var j = 0; j < topTrends.length; j++) {
      		row.push(topTrends[j][i+1]);
      	}
      	rows.push(row);
      }
      google.charts.setOnLoadCallback(function() {
      	 drawTrendHistory(rows, trendNames);
      });
     
    }
  }
  xmlhttp.open("GET", "./backend/trends.php?latest=true&n="+n, true);
  xmlhttp.send();
}


/* Fetch recent history for a single trend.
Arg:
	trend (string): name of the trend whose data to fetch.
*/
function getRow(trend) {
	var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response = JSON.parse(this.responseText);
      console.log(response);
    }
  }

  var trend = encodeURIComponent(trend);
  xmlhttp.open("GET", "./backend/trends.php?latest=true&trend="+trend, true);
  xmlhttp.send();
}



/* Show the list of worlwide trends in the sidebar. Separate from listTrends()
since this data is pulled from the trends.db database to match the update frequency of
the history chart.
Arg:
	trendData (array): an array of database rows in the form of [timestamp1 => volume1, ..., trend => name]
*/
function listWorldwideTrends(trendData) {
	var sidebar = document.getElementById("tweets");

	// Set sidebar header: format a human readable timestamp from the latest column name
	var keys = Object.keys(trendData[0]);
	keys.sort(); // alphabetical ordering
	var latest = keys[keys.length - 2];  // latest timestamp (the key at length-1 is "trend")
	var timestamp = formatTimestamp(latest);  // timestamp in milliseconds
	var d = new Date(timestamp);	// convert to UTC string
  since = d.toUTCString();

  var msg = "<h3>Trending topics Worldwide </h3>\
    <h5>As of " + since + "</h5>\
    <h6>Previous 24h ordered by tweet volume</h6>";
  setMessage(msg, true);


  // Create a list of trends and their most recent volumes.
  // Sort trend by the latest column
  trendData.sort(function (a, b) { return b[latest] - a[latest]; });

  var table = document.createElement("table");
  table.id = "trend-table";

  for (var i = 0; i < trendData.length; i++) {
    var node = document.createElement("li");
    var name = trendData[i]["trend"];
    var url = "https://twitter.com/search?q=" + encodeURIComponent(name); 
   

    // Create an url for tweets near current country using Twitter's "near" search operator.
    // Not very accurate, possibly ignores town names (ie. tweets near London may not
    // show up for tweets near UK?)
    //var locUrl = url + encodeURIComponent(" near:"+location);

    // New table row at ith position
    var row = table.insertRow();

    // Create <td> elements for trend name, global Twitter link and country Twitter link
    var trendCell = row.insertCell(0);
    var volumeCell = row.insertCell(1);
    volumeCell.className = "volume-cell";

    var globalCell = row.insertCell(2);

    // Add tweet volume, this is only visible for "Worldwide" data
    volumeCell.innerHTML = formatThousands(trendData[i][latest]);

    // <a> for linking trend name to showing data on the chart
    var a = document.createElement("a");
    var linkTextNode = document.createTextNode(name);
    a.appendChild(linkTextNode);
    a.title = name;
    a.href = "#";

    a.addEventListener("click", function() {
      var q = encodeURIComponent(this.text);
      var params = formatParams({"q": q});
      getTrends(params, showCountries);
    });

    // <img>s for displaying Twitter search results globally and locally
    trendCell.appendChild(a);
    var img = createImgLink("./img/Twitter_Logo_Blue.png", url, 28);
    img.title = "Search in Twitter";
    img.style.paddingRight = "10px";
    globalCell.appendChild(img);
  }

  // Attach the table to the sidebar
  sidebar.appendChild(table);
  
}

/***************************************************************************
* Helper functions *
*******************/

/* Formats a GET parameter string from given params object./
Arg:
  params (Object): parameters as a key => value pairs
Return:
  a string of the form ?key1=val1&...
*/
function formatParams(params) {
  var q = "?";
  for (key in params) {
    q += key + "=" + params[key] + "&";
  }
  // Strip extra "&" from the end
  return q.slice(0, -1)
}

/* Create an <img> element linking to url.
Args:
	src (string): path to the image to show
	url (string): url to link to
	height (int): height of the image in pixels
*/
function createImgLink(src, url, height) {
  // create <img>
  var img = document.createElement("img");
  img.src = src;
  img.height = height;

  // create <a>
  var a = document.createElement("a");
  a.appendChild(img);
  a.href = url;

  return a;
}

/* Format a trends.db column timestamp to UNIX timestamp. Assume date is 
current month.
Arg:
	timestamp (string): A column header in trends.db, eg. "d_27_1230"
*/
function formatTimestamp(timestamp) {
	var time = timestamp.split("_")[2];
  var hour = parseInt(time.slice(0, 2));  // hour part in the timestamp
  var minutes = parseInt(time.slice(2, 4));

  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minutes);
  var ms = d.getTime();
  // if the created timestamp is in the future due to correct date was yesterday,
  // subtract 24 hours
  if (d > now) {
  	return ms - 24 * 60 * 60 * 1000;
  }
  return ms;
}

/* Fetch trending data directly from Twitter using given coordinates.
Returns null, if coordinates doesn't match a location Twitter has trending information.
DEPRICATED: trending information is now read from local cache via getTrends()
Args:
  lat (float): latitude in degrees
  lng (float): longitude in degrees
*/
function fetchTrends(lat, lng) {
  // Clear previous data
  clearMarkers();
  uaddress = [];

  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response_str = this.responseText;
      var response = JSON.parse(response_str);
      // Sort trends by tweet volume
      response[0]["trends"].sort(function(a, b) {
        return b.tweet_volume - a.tweet_volume;
      });

      var since = response[0]["as_of"];
      var location = response[0]["locations"][0]["name"];
      document.getElementById("trends-bar").innerHTML = location + "<br/>" + since;
      //displayTrends(response); // return data is in different format to what this function requires

    }
    else if (this.status == 500) {
      setMessage("Something went wrong :( The server encoutered an internal error with the following message:<br/>" +
         this.statusText + "<br/>Try again.");
    }
  }
  xmlhttp.open("GET", "./php/fetch_trends.php?lat="+lat+"&lng="+lng, true);
  xmlhttp.send();
}

/* Debug function: show tweet volume on the trend list. */
function showVolume() {
  var volume = document.getElementsByClassName("volume-cell");
  for (var i=0; i<volume.length; i++) {
    volume[i].style.display = "table-cell";
  }
}