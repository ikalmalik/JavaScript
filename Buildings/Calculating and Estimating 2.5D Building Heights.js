// 1. Define a point of interest (POI)
var poi = 
    ee.Geometry.Polygon(
        [[[77.67456719486366, 13.028734308323427],
          [77.67456719486366, 13.011842258079875],
          [77.69585320560584, 13.011842258079875],
          [77.69585320560584, 13.028734308323427]]], null, false);
          
Map.centerObject(geometry, 12);

// 2. Load the Google Open Buildings Temporal dataset
var buildingCollection = ee.ImageCollection('GOOGLE/Research/open-buildings-temporal/v1');

// 3. Function to add building presence and height layers for a given timestamp
function displayBuildingLayers(timestamp) {
// Filter the image collection for the specific timestamp and create a mosaic
  var buildingImage = buildingCollection
    .filter(ee.Filter.eq('system:time_start', timestamp))
    .mosaic();

// 4. Extract the year from the timestamp
  var year = ee.Date(timestamp).get('year').getInfo();
                                                      // ee.Date(timestamp): Converts the raw timestamp into an Earth Engine Date object (To  perform date operations like getting the year, month, etc.)
                                                      // get('year'): Extracts the year from the ee.Date.
                                                      // getInfo(): Converts the Earth Engine object into JavaScript value (for printing, exporting, naming)

// 5. Add the building presence layer (binary: 0 or 1)
  Map.addLayer(buildingImage.select('building_presence'), {max: 1}, 
               'Building Presence ' + year);
// For map legend, it dynamically includes the year (for example, if year = 2023, label be like this: "Building Presence 2023")
  
// 6. Add the building height layer (in meters), but keep it hidden by default
  Map.addLayer(buildingImage.select('building_height'), {max: 100}, 
               'Building Height ' + year, false);
}
// For map legend, it dynamically includes the year (for example, if year = 2023, label be like this: "Building Height 2023")

// 7. Get timestamps for the latest 5 years
var timestamps = buildingCollection
  .filterBounds(poi)
  .aggregate_array('system:time_start') // Collects all the values of the system:time_start property (timestamp of each image) into a list.
  .distinct()                           // Removes duplicate timestamps, in case multiple images have the same date.
  .sort()                               // Sorts the timestamps in ascending order (oldest to newest).
  .getInfo()                            // Converts the server-side Earth Engine object into a client-side JavaScript array
  .slice(-5);                           // Get the latest 5 years - Returns the last 5 timestamps from the sorted list.

// 8. Apply the function to each timestamp
timestamps.forEach(displayBuildingLayers);

// This line loops through each timestamp in the timestamps array and calls the function displayBuildingLayers() on each one.
// .forEach() is a built-in JavaScript method used to loop through all elements in an array.

// 9. Center the map on the point of interest
Map.centerObject(geometry, 12);


// 10. Export the latest year's building height data
var latestYear = ee.Date(timestamps[timestamps.length - 5]).get('year').getInfo();
                                                          //  ee.Date: Converts the timestamp into an Earth Engine Date object.
                                                          // .get('year'): Extracts the year part (like 2019, 2020).
                                                          // .getInfo(): Retrieves that year as a plain JavaScript value
var latestImage = buildingCollection
  .filter(ee.Filter.eq('system:time_start', timestamps[timestamps.length - 5]))    // Filters the collection to include only the image corresponding to that timestamp.
  .mosaic()                                                                        // Combines multiple tiles (if any) into one continuous image
  .select('building_height');                                                  

// 11. Export the building height raster to Google Drive
Export.image.toDrive({
  image: latestImage.clip(poi), // Clip to based on Study area
  description: 'Building_Height_' + latestYear,
  folder: 'GEE_Exports',
  fileNamePrefix: 'building_height_' + latestYear,
  region: poi,
  scale: 4,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

// 12. Export the latest year's building presence data
var latestYear = ee.Date(timestamps[timestamps.length - 5]).get('year').getInfo();
var latestImage = buildingCollection
  .filter(ee.Filter.eq('system:time_start', timestamps[timestamps.length - 5]))
  .mosaic()
  .select('building_presence');

// 13. Export the building presence raster to Google Drive
Export.image.toDrive({
  image: latestImage.clip(poi), // Clip to based on Study area
  description: 'building_presence_' + latestYear,
  folder: 'GEE_Exports',
  fileNamePrefix: 'building_presence_' + latestYear,
  region: poi,
  scale: 4,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
