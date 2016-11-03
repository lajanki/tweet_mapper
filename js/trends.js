/* Functions for fetching Twitter trends data and displaying it on a 
Google geochart.


2.11.2016
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
	timestamp (string): a database timestamp in the form of "d_26_1230" of the latest addition to the database.
*/
function drawTrendHistory(trendData, columnNames, hTickMarks, timestamp) {
  var data = new google.visualization.DataTable();
  var timestamp = new Date(timestamp * 1000);  // convert timestamp to milliseconds
  var offset = -timestamp.getTimezoneOffset() / 60;  // offset from UTC to local time in hours
  offset = ((offset > 0) ? "+" : "") + offset // add a + sign if necessary
  timestamp = timestamp.toString();
 

  // Read headers from the first row in trends and create columns for the chart data,
  // columns == trend names
  data.addColumn("datetime", "time");
  for (var i = 0; i < columnNames.length; i++) {
    data.addColumn("number", columnNames[i]);
  }

  data.addRows(trendData);
  _trendHistoryChart["data"] = data;
  // Format the timestamp column.
  var formatter = new google.visualization.DateFormat({pattern: "MMM d H:mm"});
  formatter.format(data, 0);

  var options = {
    height: 450,
    pointSize: 5,
    title: "Current and recent worldwide top trends by tweet volume. Updated " + timestamp,
    legend: {textStyle: {fontSize: 14}},
    curveType: "function",
    hAxis: {
  		title: "Time (GMT " + offset + " )",
  		ticks: hTickMarks,
  		format: "H:mm"
		},
		vAxis: {
			title: "Tweet Volume",
			viewWindow: { min: 0 }
		}
  };
  _trendHistoryChart["options"] = options;

  var chart = new google.visualization.LineChart(document.getElementById("trends-bar"));
  //var chart = new google.charts.Line(document.getElementById("trends-bar"));  // material charts version
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
	response (Object): an associative array of:
		"data": a list of rows from trends.db as returned by backend/trends.php,
		"timestamp": modification time of the database in seconds
*/
function getLatestTrends(response) {
  var dbRows = response["data"];
  //console.log("rows:", dbRows);

  // Transform database column headers to UNIX timestamps and reformat the data to arrays of
  // [timestamp, trend1, trend2, ...] using the top 10 trends as ordered by the latest measurement.
  var keys = Object.keys(dbRows[0]);
  keys = keys.sort().slice(0, -1);  // keys, without "trend", sorted in alphabetical order (ie. latest timestamp is last)
  //console.log(keys);
  var latest = keys[keys.length-1];

  /*
  // Get time delta between the first and second columns
  var ts = keys[0].split("_")[2];
  var hour1 = parseInt(ts.slice(0, 2));
  ts = keys[1].split("_")[2];
  var hour2 = parseInt(ts.slice(0, 2));
  delta = hour1 - hour2;
  //console.log(delta)
  */
  var delta = 2;
 
  // Find the indices of the top 10 trends according to the most recent measurement
  var volumes = [];  // array for (volume, idx)-pairs
  for (var i = 0; i < dbRows.length; i++) {
  	var volume = parseInt(dbRows[i][latest]);
  	volumes.push([volume, i]);
  }
  // Sort in descending order and take top 10 values
  volumes.sort(function(a, b) { return b[0] - a[0] });
  volumes = volumes.slice(0, 10);

  // Find top 10 trends by row sums
  var rowSums = [];  // array for (total_tweet_volume, idx, trend_name)-tuples
  for (var i = 0; i < dbRows.length; i++) {
  	var sum = 0;
  	for (key in dbRows[i]) {
  		if (key != "trend" && dbRows[i][key] != "-1") {  // exclude the trend name and missing vales from the sum
  			sum += parseInt(dbRows[i][key]);
  		}
  	}
  	rowSums.push([sum, i]);
  }

  // Sort and get top 10 trends
	rowSums.sort(function(a, b) { return b[0] - a[0]; });
	rowSums = rowSums.slice(0, 10);
	//console.log(rowSums);

	// Combine volumes and rowSums, filtering out duplicate dbRow indices 
	var trendNames = [];
	var highVolumes = rowSums.concat(volumes);
	var rowIdx = [];  // list of dbRows indices of the data to draw
	for (var i = 0; i < highVolumes.length; i++) {
		// Only get unique indices from highVolumes
		var idx = highVolumes[i][1];
		if (rowIdx.indexOf(idx) == -1) {
			rowIdx.push(idx);
			// Add the trend name to separate list
			trendNames.push(dbRows[idx]["trend"]);
		}
	}


	var ticks = [];  // tickmarks for the chart
	var data = [];  // datarows to draw
	var now = new Date(); // a single static timestamp to compare database column headers to
	for (var i = 0; i < keys.length; i++) {
		var timestamp = formatTimestamp(keys[i], now);
		ticks.push(timestamp);

  	var row = [timestamp];
  	// add volumes for this timestamp to the row
		for (var j = 0; j < rowIdx.length; j++) {
			var idx = rowIdx[j];  // index of the db row whose timestamp value to read
			var volume = parseInt(dbRows[idx][keys[i]]);
			volume = (volume == 0) ? 10000 : volume;  // transform 0s to 10 000 and -1s to nulls
			volume = (volume == -1) ? null : volume;
			row.push(volume);
		}
		data.push(row);
	}
	//console.log("data:", data);

  google.charts.setOnLoadCallback(function() {
  	 drawTrendHistory(data, trendNames, ticks, response["timestamp"]);
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

/* Format a trends.db column timestamp to UNIX timestamp by comparing time value
to current timestamp.
Arg:
	timestamp (string): A column header in trends.db, eg. "d_27_1230"
	currentDate (Date): the current time as a Date to compare each header to
*/
function formatTimestamp(header, currentDate) {
	// parse timestamp to date and time portions
	var time = header.split("_");
	var date = parseInt(time[1]);
  var hour = parseInt(time[2].slice(0, 2));  // hour part of the header
  var minutes = parseInt(time[2].slice(2, 4));

  // Copy currentDate to a temp Date
  var ts = new Date(currentDate.getTime());
  ts.setHours(hour);
  ts.setMinutes(minutes);
  ts.setDate(date);

  // If ts is in the future due to a day change between months
  // set month to the previous month.
  if (ts > currentDate) {
  	ts.setMonth(ts.getMonth() - 1);  // setMonth(-1) results to December of the previous year  
  }

  return ts;
}

/* Debug function: show tweet volume on the trend list. */
function showVolume() {
  var volume = document.getElementsByClassName("volume-cell");
  for (var i=0; i<volume.length; i++) {
    volume[i].style.display = "table-cell";
  }
}