<?php
/* Functions for fetching trending topics from local Twitter cache at trends.json. */



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
* Main *
*******/

if (isset($_GET["loc"])) {
	$trends = get_trends($_GET["loc"]);
	print($trends);
}

else if (isset($_GET["fetch_all"])) {
	$locations = get_locations();
	print($locations);
}

else if (isset($_GET["q"])) {
	$locations = search_trends($_GET["q"]);
	print($locations);
}
?>

