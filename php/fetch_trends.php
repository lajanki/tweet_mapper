<?php
/* Functions for fetching trending topics from local Twitter cache at trends.json. */


$trend_loc = $_GET["loc"];
$fetch_all = $_GET["fetch_all"];
$q = $_GET["q"];


/* Get trends matching $location from backend/trends.json.
Arg:
	$location (string): name of a location matcing a key in trends.json
Return:
	JSON encoded array of ["created_at", "as_of", "trends", "locations"]
*/
function get_trends($location) {
	$str = file_get_contents("../backend/trends.json");
	$json = json_decode($str, true);

	$trends = $json[$location][0];

	// Return a JSON string
	return json_encode($trends);
}

/* Get a list of trend locations. Reads location names from trends.json rather than
available_trends.json to keep location names in synch with locations that actually
have trending data.
Return:
	JSON encoded array of the country names where trending data is available.
*/
function get_locations() {
	$str = file_get_contents("../backend/trends.json");
	$json = json_decode($str, true);

	return json_encode(array_keys($json));
}

/* Search for countries where $trend is trending.
Return
	JSON encoded array of countries.
*/
function search_trends($q) {
	$str = file_get_contents("../backend/trends.json");
	$json = json_decode($str, true);

	$locations = array();
	foreach($json as $country => $data) {
		$trends = $data[0]["trends"];
		foreach($trends as $trend) {
			if ($trend["name"] == $q) {
				array_push($locations, $country);
				break;
			}
		}
	}
	return json_encode($locations);
}

/*****************************************************************************************
* Aux functions, query Twitter directly for trending data *
**********************************************************/

/*
This should be initialized properly before using the below functions!
require_once("TwitterAPIExchange.php");

//Read keys from file
$string = file_get_contents("../backend/keys.json");
$json = json_decode($string, true);

// Create a twitter object
$settings = array(
	"oauth_access_token" => $json["TWITTER_OAUTH_TOKEN"],
	"oauth_access_token_secret" => $json["TWITTER_OAUTH_SECRET"],
	"consumer_key" => $json["TWITTER_API_KEY"],
	"consumer_secret" => $json["TWITTER_API_SECRET"]
);
$twitter = new TwitterAPIExchange($settings);
$lat = $_GET["lat"];
$lng = $_GET["lng"];
*/


/* Get trends from given place. */
function trends_by_loc($lat, $long) {
	global $twitter;

	// Get the parent country WOEID matching the parameters
	$woeid = get_closest_woeid($lat, $long);

	
	// Define request and query parameters
	$url = 'https://api.twitter.com/1.1/trends/place.json';
	$getfield = "?id=" . $woeid;

	// Perform the request.
	$response_str = $twitter->setGetfield($getfield)
    ->buildOauth($url, "GET")
    ->performRequest();

    $response = json_decode($response_str, true);
    
    return $response_str;
}

/* Get the closest country Yahoo WOEID to given coordinates
for which trending information exists. */
function get_closest_woeid($lat, $long) {
	global $twitter;

	// Define request and query parameters
	$url = 'https://api.twitter.com/1.1/trends/closest.json';
	$getfield = "?lat=" . $lat . "&long=" . $long;

	$response_str = $twitter->setGetfield($getfield)
    ->buildOauth($url, "GET")
    ->performRequest();

    // Response is either a city or a country (parentid == 1).
    // Return value should be the country code
    $response = json_decode($response_str, true);
    $parent_id = $response[0]["parentid"];
    if ($parent_id == 1) {
    	return $response[0]["woeid"];
    }
    return $response[0]["parentid"];
}



/*****************************************************************************************
* Main *
*******/

if (isset($lat, $lng)) {
	$trends_str = trends_by_loc($lat, $lng);
	print($trends_str);
}

else if (isset($trend_loc)) {
	$trends = get_trends($trend_loc);
	print($trends);
}

else if (isset($fetch_all)) {
	$locations = get_locations();
	print($locations);
}

else if (isset($q)) {
	$locations = search_trends($q);
	print($locations);
}
?>

