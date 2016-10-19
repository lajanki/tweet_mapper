<?php

// Functions for searching tweets by coordinates and user timelines using bearer tokens and application authentication.


$lat = $_GET["lat"];
$lng = $_GET["lng"];
$user = $_GET["user"];

// Load bearer token from file (little_youtube)
$string = file_get_contents("../backend/keys.json");
$json = json_decode($string, true);
$bearer_token = $json["TWITTER_BEARER_TOKEN"];


/* Search for tweets near given location.
Args:
	$bearer_token (string): the bearer token used for application authentication 
	$lat (float): latitude in degrees
	$long (float): longitude in degrees
	$r (string): search radius (string since it's directly passed as a GET request parameter) 
	$count (int): number of results to fetch
Return:
	An array of the tweets found
*/
function tweets_by_loc($bearer_token, $lat, $long, $r="5", $count="30"){
	$url = "https://api.twitter.com/1.1/search/tweets.json";
	// Format the location parameter to the required format
	$loc = sprintf("%f,%f,%skm", $lat, $long, $r);

	// Note: the q parameter is required: use a whitespace character " ".
	$q=urlencode(" ");
	$formed_url = "?q=".$q."&geocode=".$loc."&count=".$count."include_entities=false&result_type=recent";

	$headers = array( 
		"GET /1.1/search/tweets.json".$formed_url." HTTP/1.1", 
		"Host: api.twitter.com", 
		"User-Agent: little_youtube",
		"Authorization: Bearer ".$bearer_token
	);
	$ch = curl_init();  // setup a curl
	curl_setopt($ch, CURLOPT_URL,$url.$formed_url); // set url to send to
	curl_setopt($ch, CURLOPT_HEADER, 1);
	curl_setopt($ch, CURLOPT_HTTPHEADER, $headers); // set custom headers
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); // return output
	
	$retrievedhtml = curl_exec($ch); // execute the curl
	curl_close($ch); // close the curl

	// parse response into associative array, remove header
	$results = explode("\r\n\r\n", $retrievedhtml);
	$data = json_decode($results[1], true);
	return($data["statuses"]);
}


/* Get the specified users recent timeline
Args:
	$bearer_token (string): the bearer token used for application authentication 
	$screen_name (string): The user's screen name
	$count (int): Number of tweets to return
Return
	The timeline tweets as an array.
*/	
function get_timeline($bearer_token, $screen_name, $count="20") {
	$url = "https://api.twitter.com/1.1/statuses/user_timeline.json";
	// Format GET parameters
	$formed_url = "?screen_name=".$screen_name."&exclude_replies=true&include_rts=false&count=".$count;

	$headers = array( 
		"GET /1.1/statuses/user_timeline.json".$formed_url." HTTP/1.1", 
		"Host: api.twitter.com", 
		"User-Agent: little_youtube",
		"Authorization: Bearer ".$bearer_token
	);
	$ch = curl_init();  // setup a curl
	curl_setopt($ch, CURLOPT_URL,$url.$formed_url); // set url to send to
	curl_setopt($ch, CURLOPT_HEADER, 1);
	curl_setopt($ch, CURLOPT_HTTPHEADER, $headers); // set custom headers
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); // return output
	
	$retrievedhtml = curl_exec($ch); // execute the curl
	curl_close($ch); // close the curl

	// parse response into associative array, remove header
	$results = explode("\r\n\r\n", $retrievedhtml);
	$data = json_decode($results[1], true);
	return($data);
}



if (isset($lat, $lng)) {
	$tweets = tweets_by_loc($bearer_token, $lat, $lng, 5, 20);
	$tweets_str = json_encode($tweets);
	print($tweets_str);
}

else if (isset($user)) {
	$timeline = get_timeline($bearer_token, $user, 20);
	$timeline_str = json_encode($timeline);
	print($timeline_str);
}




?>