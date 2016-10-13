#!/usr/bin/python
# -*- coding: utf-8 -*-

import twython
import json
import random
import argparse
import time
import os

# Functions to fetch Twitter trend data and user timelines


# load Twitter keys from file
with open("./keys.json") as f:
	keys = json.load(f)

API_KEY = keys["TWITTER_API_KEY"]
API_SECRET = keys["TWITTER_API_SECRET"]
OAUTH_TOKEN = keys["TWITTER_OAUTH_TOKEN"]
OAUTH_SECRET = keys["TWITTER_OAUTH_SECRET"]
twitter = twython.Twython(API_KEY, API_SECRET, OAUTH_TOKEN, OAUTH_SECRET)



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


def fetch_trend_batch():
	"""Fetch the trending data for the next set of 15 locations as listed in available_trends.json."""
	with open("./available_trends.json") as f:
		available = json.load(f)

	# fetch the next batch
	index = available["index"]
	batch = available["locations"][index: index + 15]

	# Fetch the trends
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
		json.dump(current_trends, f, indent = 4, separators=(',', ': '), sort_keys = True)


###############################################################################
# Timeline data #
#################

def get_timeline(screen_name, n):
	"""Read n most recent tweets from given account."""

	tweets = twitter.get_user_timeline(screen_name = screen_name, exclude_replies = True, include_rts = False, count = n)
	#tweets = twitter.cursor(twitter.get_user_timeline, screen_name = screen_name, exclude_replies = True, count = n)

	return tweets


def tweets_by_loc(lat, long_, r, n, q=" "):
	loc = "{},{},{}km".format(lat, long_,r)
	tweets = twitter.search(q = q, geocode = loc, count = n, include_entities = False)

	return tweets["statuses"]


###############################################################################
# Rate status #
###############

def get_rate_status():
	"""Show Twitter rate limits."""
	rates = twitter.get_application_rate_limit_status(resources="statuses,search,trends")
	print "Rate usage for:", get_identity()
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


###############################################################################
# Main #
########

if __name__ == "__main__":
	parser = argparse.ArgumentParser(description = "Twitter bitchbot: finds tweets with poor grammar.")
	parser.add_argument("--rates", help = "Show Twitter API call rates", action = "store_true")
	parser.add_argument("--fetch-trend-locations", help = "Fetch available trend location data from Twitter and store to file. Add \"country\" to store the data only for countries",
		nargs = "?",
		const = 1,	# add a constant value for determining whether to fetch only country data
		metavar = "countries_only"
	)
	parser.add_argument("--fetch-trends", help = "Fetch trend data for the next batch of locations", action = "store_true")
	args = parser.parse_args()
	print args

	if args.fetch_trend_locations:
		countries_only = False
		if args.fetch_trend_locations != 1:
			countries_only = True
		fetch_available_trend_locations(countries_only)

	elif args.fetch_trends:
		fetch_trend_batch()

	else:
		get_rate_status()
	