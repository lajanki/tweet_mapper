<?php

/* Twitter querying functions for fetching tweets near a location as well as
user timelines. */

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
$user = $_GET["user"];


/* Search for tweets near given location.
Args:
	$lat (float): latitude in degrees
	$long (float): longitude in degrees
	$r (int): search radius
	$count (int): number of results to fetch
*/
function tweets_by_loc($lat, $long, $r, $count) {
	global $twitter;

	// Define request and query parameters
	$url = 'https://api.twitter.com/1.1/search/tweets.json';
	// Format a geolocation parameter.
	/* Notes:
	   * Documentation regarding the goelocation parameter:
		 https://dev.twitter.com/rest/public/search
		 When conducting geo searches, the search API will first attempt to find tweets which have lat/long within the queried geocode, and in case of not having success, it will attempt to find tweets created by users whose profile location can be reverse geocoded into a lat/long within the queried geocode, meaning that is possible to receive tweets which do not include lat/long information.
	   * The geolocation parameter also returns retweets whose origininal source is in the specified range, but the retuned tweet is not,
	     Silly API.
	*/
	// format the location parameter
	$loc = sprintf("%f,%f,%skm", $lat, $long, $r);
	// Note: the q parameter is required: use a whitespace character " ".
	$getfield = "?q= &geocode=".$loc."&count=".$count."include_entities=false&result_type=recent";

	// Perform the request.
	$response_str = $twitter->setGetfield($getfield)
    ->buildOauth($url, "GET")
    ->performRequest();

    // Process returned tweets:
    // Add embed codes and in case of retweets, get the original tweet data.
    $json = json_decode($response_str, true);
    $tweets = $json["statuses"];

    $ids = array();
    $tmp = array();
    foreach ($tweets as $tweet) {
    	// Check retweet status and point to the original tweet
    	// ie. the one from the specified location
    	if (array_key_exists("retweeted_status", $tweet)) {
    		$tweet = $tweet["retweeted_status"];
    	}

    	// check if this tweet was already processed
    	// ie. is this a retweet of something we've already seen
    	$id = $tweet["id_str"];
    	if (!in_array($id, $ids)) {
	    	$embed = get_oembed($id);
	    	// Add the code as a new field to the tweet object
	    	$tweet["embed"] = $embed;
	    	array_push($tmp, $tweet);
	    	array_push($ids, $id);
    	}
    }

    // Return the tweets as a string
    // (does not return the metadata part of the original response)
    return json_encode($tmp);
}


/* Get the given users recent timeline
Return
	an array of the users tweets 
*/	
function get_timeline($screen_name, $count) {
	global $twitter;

	// define request and query parameters:
	// exclude replies and retweets
	$url = "https://api.twitter.com/1.1/statuses/user_timeline.json";
	$getfield = "?screen_name=".$screen_name."&exclude_replies=true&include_rts=false&count=".$count;

	// perform the request
	$response = $twitter->setGetfield($getfield)
    ->buildOauth($url, "GET")
    ->performRequest();

    $tweets = json_decode($response, true);
    foreach ($tweets as &$tweet) {
		$id = $tweet["id_str"];
		$embed = get_oembed($id);
		// Add the code as a new field to the tweet object
		$tweet["embed"] = $embed;
    }
    // $tweet is still referencing to $tweets[-1],
    // unset it to prevent accidental changes to $tweets
    unset($tweet);

    // Return response as a json encoded string
    return json_encode($tweets);
    //return json_encode($response);
}


/* Get oEmbed code for a given tweet. */
function get_oembed($tweet_id, $hide_thread = false, $hide_media = false) {
	global $twitter;

	$url = "https://api.twitter.com/1.1/statuses/oembed.json";
	// set omit_script to true and language to en
	$getfield = "?id=".$tweet_id."&omit_script=true&lang=en&hide_media=".$hide_media."&hide_thread=".$hide_thread;

	// perform the request
	$response_str = $twitter->setGetfield($getfield)
    ->buildOauth($url, "GET")
    ->performRequest();

    // parse html part from the response
    $json = json_decode($response_str, true);
    return $json["html"];
}


if (isset($lat, $lng)) {
	$tweets_str = tweets_by_loc($lat, $lng, 5, 20);
	print($tweets_str);
}

else if (isset($user)) {
	$timeline = get_timeline($user, 20);
	print($timeline);
}

//$tweets = tweets_by_loc(30.338241, -81.716167, 5, 20);
//var_dump($tweets[0]);

//$timeline = get_timeline("patricksjoo", 10);
//var_dump($timeline);
?>

