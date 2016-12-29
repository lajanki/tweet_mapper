#!/usr/bin/python
# -*- coding: utf-8 -*-

"""
Functions to fetch Twitter trend data and user timelines.

Trends can be stored as both json for the most recent data only (overwriting previous),
or to a database for permanent storage.

changelog:
29.12.2016
 * Changed the way trend data is fetched to reflect updated API rate limits: trending data for
   all countries is now fetched in a single take. The database for worldwide trends is updated
   whenever worlwide data is fetched.

17.10.2016
 * Initial version
"""

import twython
import json
import random
import argparse
import time
import datetime
import sqlite3
import requests
import os


PATH = "/home/pi/python/tweet_mapper/backend/"
os.chdir(PATH)

# little_youtube keys
with open("./keys.json") as f:
	keys = json.load(f)

API_KEY = keys["TWITTER_API_KEY"]
API_SECRET = keys["TWITTER_API_SECRET"]
OAUTH_TOKEN = keys["TWITTER_OAUTH_TOKEN"]
OAUTH_SECRET = keys["TWITTER_OAUTH_SECRET"]
BEARER_TOKEN = keys["TWITTER_BEARER_TOKEN"]

# Connect to Twitter using a bearer token and application authentication
twitter = twython.Twython(API_KEY, access_token = BEARER_TOKEN)
#twitter = twython.Twython(API_KEY, API_SECRET, OAUTH_TOKEN, OAUTH_SECRET)


###############################################################################
# Fetch tweets #
################

def get_timeline(screen_name, n):
	"""Read n most recent tweets from given account."""

	tweets = twitter.get_user_timeline(screen_name = screen_name, exclude_replies = True, include_rts = False, count = n)
	#tweets = twitter.cursor(twitter.get_user_timeline, screen_name = screen_name, exclude_replies = True, count = n)

	return tweets


def tweets_by_loc(lat, lng, r, n, q = " "):
	loc = "{},{},{}km".format(lat, lng ,r)
	tweets = twitter.search(q = q, geocode = loc, count = n, include_entities = False)

	for tweet in tweets["statuses"]:
		tweet_id = tweet["id_str"]
		screen_name = tweet["user"]["screen_name"]
		get_oembed(tweet_id, screen_name)

	return tweets["statuses"]


def get_oembed(tweet_id, screen_name):
	# Format tweet url from the id
	tweet_url = "https://twitter.com/" + screen_name + "/status/" + tweet_id
	params = {"url": tweet_url, "omit_script": True, "lang": "en"}
	url = "https://publish.twitter.com/oembed"

	r = requests.get(url, params = params)
	return r.json()["html"]


###############################################################################
# Trending data #
#################

def fetch_available_trend_locations(countries_only):
	"""Fetch list of locations for which trend data exists.
	Arg:
		countries_only (boolean): whether city data should be excluded, (worlwide is still included)."""
	available = twitter.get_available_trends()
	if countries_only:
		available = [item for item in available if item["parentid"] in (0, 1)]


	# Add a read index to note which locations should be queried for actual
	# trends next.
	d = {"locations": available, "index": 0}

	with open("./available_trends.json", "w") as f:
		json.dump(d, f, indent = 4, separators=(',', ': '))


def fetch_trends():
	"""Fetch current trending data for the locations listed in available_trends.json."""
	with open("./available_trends.json") as f:
		available = json.load(f)

	trend_data = {}
	for loc in available["locations"]:
		woeid =  loc["woeid"]
		name = loc["name"]

		print "Fetching trends for", name
		try:
			trends = twitter.get_place_trends(id = woeid)
			trend_data[name] = trends

			# store worldwide trends to the database
			if woeid == 1:
				db_store_trends(trends)

		except twython.TwythonRateLimitError as e:
			print e
			print "Skipping rest of this batch."
			break

	# Store the data to trends.json
	with open("./trends.json", "w") as f:
		json.dump(trend_data, f, indent = 4, separators = (',', ': '), sort_keys = True)


def fetch_trend_batch():
	"""Fetch the trending data for the next set of 15 locations as listed in available_trends.json.
	DEPRECATED: Twitter API rate limits have increased to 75 calls / 15 minutes as of ~ November 2016.
				There's no more need to fetch trending data in batches. See fetch_trends above.
	"""
	with open("./available_trends.json") as f:
		available = json.load(f)

	# fetch the next batch
	index = available["index"]
	batch = available["locations"][index: index + 15]

	# open existing trend file
	try:
		with open("./trends.json") as f:
			current_trends = json.load(f)
	except IOError as e:
		current_trends = {}

	# grab trends for the next 15 locations or until we hit the rate limit
	for idx, loc in enumerate(batch):
		woeid =  loc["woeid"]
		name = loc["name"]

		print "Fetching trends for", name
		try:
			trends = twitter.get_place_trends(id = woeid)
			current_trends[name] = trends
		except twython.TwythonRateLimitError as e:
			print e
			print "Skipping rest of this batch."
			break

	# store the new index back to available_trends.json,
	# idx == how many locations were succesfully processed
	index += idx + 1
	if index > len(available["locations"]) - 1:
		index = 0  

	# Store new index back to available_trends.json
	available["index"] = index
	with open("./available_trends.json", "w") as f:
		json.dump(available, f, indent = 4, separators=(',', ': '))	


	# Store the trending data back to trends.json
	with open("./trends.json", "w") as f:
		json.dump(current_trends, f, indent = 4, separators = (',', ': '), sort_keys = True)


def db_store_trends(trend_data):
	"""Store worldwide trends to trends.db database for more permanent storage.
	Arg:
		trend_data (dict) the API response containing current worldwide trends
	
	database format codes:
		tables: w_%W_%y  (ie. w_(week)_(year))
		columns: d_%d_%H%M (ie. d_(day)_(time))

	to transform a date to a table name:
	d = datetime.date(2016, 11, 2)
	year = d.strftime("%y")
	week = d.strftime("%W")
	"""

	months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

	"""
	# Store trend data to database:
	# Determine the correct tablename from current data (tablenames are in the form of oct16, nov16 etc.).
	year = time.strftime("%y") # year in 2 digit format
	month_idx = int(time.strftime("%m")) # month in [1, 12]
	table = months[month_idx - 1] + str(year)
	"""


	# Format a table name
	table = time.strftime("w_%W_%y")

	# Create a timestamp for a new column to add to the database
	col = time.strftime("d_%d_%H%M")

	conn = sqlite3.connect("./trends.db")
	cur = conn.cursor()

	with conn:
		# Create a query string for initializing a table,
		# use string formatting, since table names cannot be targetted for parameter subsitution.
		query = "CREATE TABLE IF NOT EXISTS {} (trend TEXT)".format(scrub(table))
		cur.execute(query)

		# Add new column in a separate query,
		# missing values defaults to -1
		query = "ALTER TABLE {} ADD COLUMN {} INTEGER DEFAULT -1".format(scrub(table), col)
		cur.execute(query)


		# Populate the new column:
		# Try to select each trend to see if it already exists in the table
		for trend in trend_data[0]["trends"]:
			name = trend["name"]
			volume = trend["tweet_volume"]
			if not volume: # fill None values with zeros
				volume = 0

			query = "SELECT trend FROM {} WHERE trend = ?".format(scrub(table))
			cur.execute(query, (name,))
			row = cur.fetchone()

			# if the row already exists, update the row
			if row:
				query = "UPDATE {} SET {} = ? WHERE trend = ?".format(scrub(table), col)
				cur.execute(query, (volume, name))

			# ...else add a new row
			else:
				query = "INSERT INTO {} (trend, {}) VALUES (?, ?)".format(scrub(table), col)
				cur.execute(query, (name, volume))



###############################################################################
# Rate status #
###############

def get_rate_status():
	"""Show Twitter rate limits."""
	rates = twitter.get_application_rate_limit_status(resources="statuses,search,trends")
	# show the screen name for the authenticated user, if we're not
	# using application only authentication
	if twitter.__dict__["oauth_version"] != 2:
		print "Rate usage for:", get_identity()
	else:
		print "Application level rate limits"
	print

	show_rates("/statuses/oembed", rates)
	show_rates("/statuses/user_timeline", rates)
	show_rates("/search/tweets", rates)
	show_rates("/trends/place", rates)
	show_rates("/trends/closest", rates)


def show_rates(path, rate_table):
	"""Display rate usage of given API endpoint.
	Args:
		path (string): a Twitter resource family path such as "/search/tweets".
		rate_table (JSON): the global rate status table as returned by Twitter
	"""
	# split path by "/" to get the family and endpoint names
	family = path.split("/")[1]
	#root, family, endpoint = path.split("/")

	stats = rate_table["resources"][family][path]
	left = stats["reset"] - int(time.time())
	print path
	print "requests remaining: {}, resets in {}s, limit /15min: {}".format(stats["remaining"], left, stats["limit"])
	print


###############################################################################
# Helper functions #
####################

def get_identity():
	"""Get the username of the authenticating users."""
	timeline = twitter.get_home_timeline(count = 1, include_entities = False)
	return timeline[0]["user"]["screen_name"]


def scrub(table_name):
	"""Scrub a database table name from invalid characters.
	scrub('); drop tables --')  # returns 'droptables'
	"""
	return ''.join( chr for chr in table_name if chr.isalnum() or chr == "_" )


def measure_tweets_by_loc():
	start = time.time()
	tweets_by_loc(40.741895, -73.989308, 5, 20)
	print "Execution time:", time.time() - start, "seconds"

	


###############################################################################
# Main #
########

if __name__ == "__main__":
	parser = argparse.ArgumentParser(description = "Pulls Twitter trending data from Twitter API to a local json file.")
	parser.add_argument("--rates", help = "Show Twitter API call rates.", action = "store_true")
	parser.add_argument("--fetch-trend-locations", help = "Fetch available trend location data from Twitter and store to file. Add \"country\" to store the data only for countries.",
		nargs = "?",
		const = 1,	# add a constant value for determining whether to fetch only country data
		metavar = "countries_only"
	)
	parser.add_argument("--fetch-trends", help = "Fetch trend data for the countries listed in available_trends.json.", action = "store_true")
	args = parser.parse_args()
	#print args

	if args.fetch_trend_locations:
		countries_only = False
		if args.fetch_trend_locations != 1:
			countries_only = True
		fetch_available_trend_locations(countries_only)

	elif args.fetch_trends:
		fetch_trends()

	else:
		get_rate_status()
	

	"""
	# serach for tweets from given coordinates using " " as a search term
	tweets = tweets_by_loc(39.28, -76.63, 5, 100)

	# choose a random tweet and get the users timeline
	t = random.choice(tweets)
	screen_name = t["user"]["screen_name"]
	print screen_name
	print "https://twitter.com/" + screen_name

	tweets = get_timeline(screen_name, 30)
	for t in tweets:
		print t["text"]
		print "source:", t["source"]
		if t["coordinates"]:
			print "coords:", t["coordinates"]["coordinates"]
		if t["place"]:
			print "place:", t["place"]["full_name"]
			print "bbox:", t["place"]["bounding_box"]["coordinates"]
		print
	"""
