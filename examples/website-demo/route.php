<?php
$curl = curl_init();
curl_setopt($curl, CURLOPT_USERAGENT, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36");

// Proxy the request to the hyperlapse site and then return the data.
$base_url = "http://hyperlapse.tllabs.io";

if($_SERVER['REQUEST_METHOD'] == 'GET'){
	// Build the URL
	$url = $base_url . "/route?ll=" . $_GET['ll'];
	curl_setopt($curl, CURLOPT_URL, $url);

	// Do the request
	$result = curl_exec($curl);

	print $result[0];
}

// Close cURL
curl_close($curl);

?>
