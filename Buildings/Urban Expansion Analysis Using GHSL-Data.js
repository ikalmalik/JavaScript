// 1. Define coordinates forming a polygon around the region of interest
var boundaryCoordinates = [
  [106.6422178161, -6.1105506929],
  [106.6422178161, -6.5345658032],
  [107.0143796813, -6.5345658032],
  [107.0143796813, -6.1105506929]
];

// Convert the coordinates into a multipolygon geometry
var studyArea = ee.Geometry.MultiPolygon([boundaryCoordinates]);

// Center the map on the study area
var aoi = studyArea;

var outline = ee.Image().byte().paint({
  featureCollection: aoi,
  color: 1,
  width: 3
});
Map.addLayer(outline, {palette: ['Red']}, "Area Studi");
var clipToCol = function(image){
  return image.clip(aoi);
};
Map.centerObject(studyArea, 11);

// 2. Load the GHSL built-up surface dataset and select only the 'built_surface' band
var builtUpCollection = ee.ImageCollection("JRC/GHSL/P2023A/GHS_BUILT_S")
  .select(['built_surface'])
  .filterBounds(studyArea);

// 3. Visualize the GHSL bands as a combined multi-band image
var builtUpStacked = builtUpCollection.toBands();

// Add it to the map (turned off by default for clarity)
Map.addLayer(builtUpStacked.clip(studyArea), {}, 'GHSL Built-up Stacked');

// 4. Export the built-up multi-band image (stacked) to Google Drive
Export.image.toDrive({
  image: builtUpStacked.clip(studyArea).float(),
  description: 'GHSL_Builtup_Stacked',
  region: studyArea,
  scale: 100,
  maxPixels: 1e13,
  folder: 'urban_expansion_output',
  crs: builtUpStacked.getInfo().crs
});

// 6. Extract the built-up surface for the year 1975
var built1975 = builtUpCollection.filter(ee.Filter.eq('system:index', '1975')).toBands();

var areaBuilt1975 = ee.Number(
  built1975.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: studyArea,
    scale: 100
  }).values().get(0)
);

print('Built-up Area in 1975 (km²):', areaBuilt1975.divide(1e6));


// Extract the built-up surface for the year 2020
var built2020 = builtUpCollection.filter(ee.Filter.eq('system:index', '2020')).toBands();

var areaBuilt2020 = ee.Number(
  built2020.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: studyArea,
    scale: 100
  }).values().get(0)
);

print('Built-up Area in 2020 (km²):', areaBuilt2020.divide(1e6));

// Convert built-up surface values to area in km² for time series
var builtUpAreaSeries = builtUpCollection.map(function(image) {
  return image.divide(1e6).copyProperties(image, image.propertyNames());
});

// 7. Generate and display a column chart showing total built-up area per year
print(
  ui.Chart.image.series(builtUpAreaSeries, studyArea, ee.Reducer.sum(), 100, 'system:time_start')
    .setOptions({
      title: 'Urban Expansion Over Time (km²)',
      vAxis: {title: 'Built-up Area (km²)'},
      hAxis: {title: 'Year'},
      series: {0: {color: 'indigo'}},
      chartArea: {width: '80%'}
    })
    .setChartType('ColumnChart')
);
