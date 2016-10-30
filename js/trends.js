/* Functions for fetching Twitter trends data and displaying it on a 
Google geochart.

TODO: add past trends to the history chart.

30.10.2016
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

/* Clear previous data from the geochart and redraw it with new locations.
Args:
	locations (array): list of country names to show on the map
*/
function drawChart(locations) {
  if (!locations.length) {
    var msg = "<p class=\"error\">No data for <i>" + _geoChart["search"] + "</i></p>";
    setMessage(msg, true);
    return;
  }

  // Draw the chart
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
* callbacks to requestFile *
****************************/

/* Display a list of a countrie's trends in the sidebar.
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
      requestFile("./php/fetch_trends.php","?q="+q, function(countries) { drawChart(countries); });
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
  requestFile("./php/fetch_trends.php","?q="+input, listTrends);
}


/************************************************************************
* Database query functions for recent trend history *
****************************************************/

/* Get the latest n columns from the latest table from the database at ../backend/trends.db.
Arg:
	dbRows (array): a list of rows from trends.db as returned by backend/trends.php.
*/
function getLatestTrends(dbRows) {
  // Transform database column headers to UNIX timestamps and reformat the data to arrays of
  // [timestamp, trend1, trend2, ...] using the top 10 trends as ordered by the latest measurement.
  var keys = Object.keys(dbRows[0]);
  keys = keys.sort().slice(0, -1);  // keys, without "trend", sorted in alphabetical order (ie. latest timestamp is last)
  //console.log(keys);

  // Find the top 10 trends
  var topTrends = [];  // init an array for trends as (trend, volume) pairs in the latest column
  for (var i = 0; i < dbRows.length; i++) {
  	var trendSeries = [dbRows[i]["trend"]];   // [trend, timestamp_n, timestamp_(n-1), ..., timestamp_1], where timestamp_1 == latest
  	for (var j = 0; j < keys.length; j++) {
  		var volume = parseInt(dbRows[i][keys[j]]);
  		if (volume == 0) { volume = 10000; }
  		else if (volume == -1) { volume = 0; }
  		trendSeries.push(parseInt(volume));
  	}
  	topTrends.push(trendSeries);
  }
  // Sort by most recent volume and cut the tail
  topTrends.sort(function(a, b) { return b[b.length-1] - a[a.length-1]; });
  topTrends = topTrends.slice(0, 10);
  var trendNames = topTrends.map(function(trend) {return trend[0]; });
  //console.log("top trends:", topTrends);
  //console.log("trends:", trendNames);


  // Reformat the data to [timestamp, trend1, trend2, ...].
  var rows = [];
  var now = new Date();
  for (var i = 0; i < keys.length; i++) {
  	// reformat timestamp to HH:MM using UTC hours.
  	var timestamp = keys[i].split("_")[2];
  	var hour = parseInt(timestamp.slice(0, 2));
  	var hourOffset = now.getUTCHours() - now.getHours();  // hour offset from local time to UTC time
  	hour += hourOffset;
  	timestamp = hour + ":" + timestamp.slice(2, 4);

  	// Create a trend row to pass to trendHistory()
  	var row = [timestamp];
  	for (var j = 0; j < topTrends.length; j++) {
  		row.push(topTrends[j][i+1]);
  	}
  	rows.push(row);
  }
  //console.log("rows:", rows);
  google.charts.setOnLoadCallback(function() {
  	 drawTrendHistory(rows, trendNames);
  });
}


/***************************************************************************
* Helper functions *
*******************/

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
	// parse timestamp to date and time portions
	var time = timestamp.split("_");
	var date = parseInt(time[1]);
  var hour = parseInt(time[2].slice(0, 2));  // hour part in the timestamp
  var minutes = parseInt(time[2].slice(2, 4));

  // Create a Date object from the timestamp.
  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth(), date, hour, minutes);

  // Return timestamp in milliseconds.
  return d.getTime();
}

/* Debug function: show tweet volume on the trend list. */
function showVolume() {
  var volume = document.getElementsByClassName("volume-cell");
  for (var i=0; i<volume.length; i++) {
    volume[i].style.display = "table-cell";
  }
}