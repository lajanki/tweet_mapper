<?php
/* Retrieve or add a geocoded entry to geo.db. */
  $loc = $_GET["loc"];
  $lat = $_GET["lat"];
  $long = $_GET["long"];

  /* Query the database for coordinates to given address. */
  function getCoords($address) {
    try {
        $db = new PDO("sqlite:./geo.db");
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // note: the directory containing the database needs to have w permission for the www-data group
        $query = $db->prepare("SELECT * FROM geo WHERE place = ?");
        $query->execute(array($loc));
        $result = $query->fetch(PDO::FETCH_ASSOC);

        //var_dump($result);

        // Check if any data was actually returned:
        // Already in the database -> return the coordinates as (lat, long)
        if ($result) {
          //$coords = array("lat"=>$result["lat"], "lng"=>$result["long"]);
          $response = array("address" => $address, "lat" => $result["lat"], "lng" => $result["long"]);
          print json_encode($response);
        }

        else {
            print json_encode([]);
        }

        $db = NULL;
         
      }

      catch(PDOException $e) {
          print json_encode("Exception:" . $e->getMessage());
      }
  }

  function addLocation($address, $lat, $long) {
    try {
        $db = new PDO("sqlite:./geo.db");
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $query = $db->prepare("INSERT INTO geo VALUES (?, ?, ?)");
        $query->execute(array($address, $lat, $long));
        $db = NULL;
        //print "Added " . $address . " to database";
         
      }

      catch(PDOException $e) {
          print json_encode("Exception:" . $e->getMessage());
      }
  }


// Add a new entry or fetch one based on the GET parameters passed in
if (isset($lat, $long)) {
    $lat = floatval($lat);
    $long = floatval($long);
    addLocation($loc, $lat, $long);
}
else if (isset($loc)) {
    getCoords($loc);
}

//$response = array("meta" => "GET:" . $_GET)
//print json_encode($response);

?>

