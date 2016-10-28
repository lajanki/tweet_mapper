<?php

/* Functions for fetching data from the database at trends.db


28.10.2016
*/


/* Fetch table names from the database. */
function fetch_table_names() {
	try {
		$db = new PDO("sqlite:trends.db");
		$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
		$tablesquery = $db->query("SELECT name FROM sqlite_master WHERE type='table';");

		$tables = $tablesquery->fetchAll();
		return $tables;
	}
	
	catch(PDOException $e) {
		return $e->getMessage();
	}
}


/* Fetch all data from specified table. */
function fetch_table($name) {
	try {
		$name = scrub($name);
		$db = new PDO("sqlite:trends.db");
		$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
		$result = $db->query("SELECT * FROM $name;");

		$table = $result->fetchAll();
		return $table;
	}
	
	catch(PDOException $e) {
		return $e->getMessage();
	}
}


/* Fetch data from the last n columns and only rows with non -1 values. */
function fetch_tail($name, $n) {
	try {
		$name = scrub($name);
		$db = new PDO("sqlite:trends.db");
		$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

		// Fetch 1 row for table names
		$result = $db->query("SELECT * FROM $name LIMIT 1;");

		// Get column names from the results
		$table = $result->fetch(PDO::FETCH_ASSOC);
		$columns = array_keys($table);
		$columns = array_slice($columns, -$n); // last 8 column names

		// Fetch the actual data
		$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
		$columns = "trend," . join(",", $columns);
		$result = $db->query("SELECT $columns FROM $name;");

		$data = array();
		// Filter rows with all -1s (row sum == -n)
		while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
			$volumes = array_slice($row, 1);  // remove the trend name
			if (array_sum($volumes) > -$n) {
				array_push($data, $row);
			}
		}
		return $data;
	}
	
	catch(PDOException $e) {
		return $e->getMessage();
	}
}


/* Fetch latest n columns from the latest table in the database. */
function fetch_latest_n($n) {
	// Get the name of the latest table in the database
	$tables = fetch_table_names();
	$latest_table = end($tables)[0];

	return fetch_tail($latest_table, $n);
}

/* Fetch a single row from the latest table where name matches a trend. */
function fetch_row($trend) {
	$tables = fetch_table_names();
	$latest_table = end($tables)[0];

	// Fetch the row
	try {
		$db = new PDO("sqlite:trends.db");
		$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
		$stmt = $db->prepare("SELECT * FROM $latest_table WHERE trend == ?");
		$stmt->execute(array($trend));
		$row = $stmt->fetch();

		return $row;
	}
	
	catch(PDOException $e) {
		return $e->getMessage();
	}
}


/* Manual database sanitation function. */
function scrub($name) {
	return preg_replace("/[^a-zA-Z0-9_]*/", "", $name);
}



/**************************************************************************
* Main *
*******/

// Fetch table names
if (isset($_GET["names"])) {
	$tables = json_encode(fetch_table_names());
	print_r($tables);
}

// Fetch tail of a table
elseif (isset($_GET["table"]) && isset($_GET["tail"]) && isset($_GET["n"])) {
	$n = intval($_GET["n"]); // parse number of columns to show to int
	$table = json_encode(fetch_tail($_GET["table"], $n));
	print_r($table);
}

// Fetch table
elseif (isset($_GET["table"])) {
	$table = json_encode(fetch_table($_GET["table"]));
	print_r($table);
}

// Fetch the latest columns from the latest table
elseif (isset($_GET["latest"]) && isset($_GET["n"])) {
	$table = json_encode(fetch_latest_n($_GET["n"]));
	print_r($table);
}

// Fetch a single row from the latest table matching a trend name
elseif (isset($_GET["latest"]) && isset($_GET["trend"])) {
	$row = json_encode(fetch_row($_GET["trend"]));
	print_r($row);
}

?>
