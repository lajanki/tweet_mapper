/* Functions for fetching Twitter trends data and displaying it on a 
Google geochart.*/

// global object for storing chart related data
var _geoChart = {
  "chart": null,
  "data": [],  // current data being displayed
  "default": [],  // all countries with trending data
  "search": "", // previous search term clicked/entered, not URL encoded
  "response": null, // previous response from fetch_trends.php
  "options": {
    width: 1450,
    height: 635,
    keepAspectRatio: false,
    defaultColor: "518E4B",
    backgroundColor: "#91CEF3"
  }
}


/************************************************************************
* Chart drawing *
****************/

/* Draw a Google geochart for locating trending data of available countries.
Only called once on page load.
Arg:
  locations (array): the list of country names with trending information
*/
function setUpChart(locations) {
  var dataRows = [];
  for (var i = 0; i < locations.length; i++) {
    dataRows.push([locations[i]]);
  }

  var data = google.visualization.arrayToDataTable(dataRows, true);
  _geoChart["data"] = data;

  var chart = new google.visualization.GeoChart(document.getElementById("geochart"));
  var trendListener = google.visualization.events.addListener(chart, "select", function() {
    var selection = chart.getSelection()[0].row;  // row index of the selected value, silently throws TypeError if not a valid selection
    var country = _geoChart["data"].getValue(selection, 0); // row, col indices to data
    //console.log(country);

    // Format GET request parameters and make the request to fetch_trends.php
    var params = formatParams({"loc": country});
    getTrends(params, listTrends);

  });
  _geoChart["chart"] = chart;

  chart.draw(data, _geoChart["options"]);
   
}

/* Clear previous data from the geochart and redraw it with new locations.*/
function redrawChart(locations, store_change = true) {
  if (!locations.length) {
    var msg = "<p class=\"error\">No data for <i>" + _geoChart["search"] + "</i></p>";
    setMessage(msg, true);
    return;
  }

  // Clear the chart of data and event listeners
  var chart = _geoChart["chart"];
  //chart.clearChart();
  //google.visualization.events.removeListener(_geoChart["listener"]);
  //_geoChart["listener"] = null;

  var dataRows = [];
  for (var i = 0; i < locations.length; i++) {
    dataRows.push([locations[i]]);
  }

  var data = google.visualization.arrayToDataTable(dataRows, true);

  if (store_change) {
    _geoChart["data"] = data;
  }
  chart.draw(data, _geoChart["options"]);
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

  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var locations = JSON.parse(this.responseText);
      _geoChart["default"] = locations;
      //console.log(locations);

      // Draw the chart
      google.charts.setOnLoadCallback(function() {
        setUpChart(locations);
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
      console.log(response);
      _geoChart["response"] = response;
      callback(response);
    }
  }
  xmlhttp.open("GET", "./php/fetch_trends.php" + params, true);
  xmlhttp.send();
}

/* Callback to getTrends: display a list of trends in the sidebar.
Args:
  trendData (Object): a trending data object for a specific location as returned by Twitter.
  show_volume (boolean): whether to display tweet volume in the sidebar.

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

    // Show tweet volume only for Worldwide information:
    // tweet_volume appear to always note global volume and possibly from longer time period than
    // the privous 24 hours. API results dosen't always math with what Twitter web page returns
    // as 'Worldwide'.
    /*
    var volume = "";
    if (location == "Worldwide") {
      volumeCell.innerHTML = formatThousands(trends[i]["tweet_volume"]);
    }
    */
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


/* Callback to getTrends: display trends in a Google column chart.*/
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

        /*
        var idx = selectedItem.row;
        var url = urls[idx];
        window.open(url, "_blank");
        */
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
  countries (array): a list of country names to highlight*/
function showCountries(countries, store_change = true) {
  //console.log(countries);
  redrawChart(countries, store_change);
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

/* Create an <img> element linking to url.*/
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

/* Fetch trending data from Twitter using given coordinates. */
function fetchTrends(lat, lng) {
  // Clear previous data
  clearMarkers();
  uaddress = [];
  //_labels = {};
  //showLoader();

  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var response_str = this.responseText;
      var response = JSON.parse(response_str);
      // Sort trends by tweet volume
      response[0]["trends"].sort(function(a, b) {
        return b.tweet_volume - a.tweet_volume;
      });
      console.log(response);

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