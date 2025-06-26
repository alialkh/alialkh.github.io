/////////////////////
//  Chart A - CPSC 583 - Sedat Islam & Ali Al-Khaz'Aly
//  Overlapping Circular Barplot
//  This code was adapted from the online D3 tutorials sourced at :
// https://www.d3-graph-gallery.com/circular_barplot.html?fbclid=IwAR1oYWzsSank3S_DRk3jjdPhx4hgD5imgMuvIUV_8t9NszwAOkq7jTLUiis
//////////////////////


// WE COULD JUST STORE ALL THIS COUNTRY STUFF AS JSON AND PARSE THE JSON?

// Create spacing variables
var margin = {top: 0, right: 0, bottom: 0, left: 0},
    width = 1500 - margin.left - margin.right,
    height = 1500 - margin.top - margin.bottom,
    innerRadius = 250,
    outerRadius = Math.min(width, height) / 2;   // the outerRadius goes from the middle of the SVG area to the border

// append the svg object
var svg = d3.select("#my_dataviz")
    .classed("svg-container", true)
    .append("svg")
    // Responsive SVG needs these 2 attributes and no width and height attr.
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("viewBox", "0 0 1500 1500")
    // Class to make it responsive.
    .classed("svg-content-responsive", true)
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + (width / 2 + margin.left) + "," + (height / 2 + margin.top) + ")");

// D3 Scales
var xScale;
var yScale;
var zScale;

// Define the div for the tooltip
//  this was adapted from http://bl.ocks.org/d3noob/a22c42db65eb00d4e369
var tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

// Columns for the mortality rates
const mortality_columns = ["Neonatal mortality rate (per 1000 live births)",
    "Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)",
    "Under-five mortality rate (probability of dying by age 5 per 1000 live births)"];

// Javascript dictionary for mapping region development to a specific color
const cntryColors = {
    "More dev. region" : "#00c0ff",
    "Less dev. region" : "#c4001a",
};
// Arrays for easier access in legends parameter
const devLevel = [ "Highly Developed Region", "Low Developed Region"];
const colorArr = [cntryColors["More dev. region"], cntryColors["Less dev. region"]];


var global_data;
var global_data_cache;
var orderingMethod_cache = 'alphabetical';

/**
 * Application Entry Point
 */
window.onload = run();

function filterData() {
    var localData = global_data.slice();

    var choices = [];
    d3.selectAll(".myCheckbox").each(function(){
        var cb = d3.select(this);
        if(cb.property("checked")){
            choices.push(cb.property("value"));
        }
    });

    // Apply filters for measures
    localData = localData.filter(function (country) {
        // If any of the measures are not implemented by the country, remove it from the data
        return !choices.some(choice => country[choice] === "0");
    });

    console.log(localData.length)

    // Pass for categorical sorting
    updateDataSortMethod(orderingMethod_cache, localData)
}

function updateDataSortMethod(orderingMethod, data = global_data_cache) {
    console.log(orderingMethod);

    orderingMethod_cache = orderingMethod;
    global_data_cache = data;
    const localData = data;

    switch (orderingMethod) {
        case "alphabetical":
            localData.sort((a, b) => a.Country.localeCompare(b.Country));
            break;
        case "child_mortality_rate":
            localData.sort((a, b) =>
                b['Under-five mortality rate (probability of dying by age 5 per 1000 live births)']
                - a['Under-five mortality rate (probability of dying by age 5 per 1000 live births)']);
            break;
        case "infant_mortality_rate":
            localData.sort((a, b) =>
                b['Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)']
                - a['Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)']);
            break;
        case "neonatal_mortality_rate":
            localData.sort((a, b) =>
                b['Neonatal mortality rate (per 1000 live births)']
                - a['Neonatal mortality rate (per 1000 live births)']);
            break;
        case "development":
            localData.sort((a, b) => a['Development_level'].localeCompare(b['Development_level']));
            break;
        case "region":
            localData.sort((a, b) => a.Region.localeCompare(b.Region));
            break;
        default:
            localData.sort((a, b) => a.Country.localeCompare(b.Country));
    }

    // Remove old bars
    svg.selectAll("path")
        .remove()
        .exit();

    // Remove old labels
    svg.selectAll("#country_legend").remove().exit();

    // Draw new Bars and Labels
    drawBarsAndLabels(localData)
}

// main entry point
function run() {

    d3.csv("../dataset.csv", function (data){

        // Setup the size dynamically
        function setup() {

            // dynamically change our SVG container's dimensions with the current browser dimensions
            width = svg.node().getBoundingClientRect().width != undefined ?
                svg.node().getBoundingClientRect().width :
                width;
            height = svg.node().getBoundingClientRect().height != undefined ?
                svg.node().getBoundingClientRect().height :
                height;
        }

        // Clean data
        data = data.filter(d => d.Country !== "");

        // We will add the abbreviation field for each country
        data.forEach(function(d)
        {
            if(!(d.Country==="")){
                var cntryName = d.Country;
                var abbrev = getiso3(getCountryCode(cntryName));
                d["Abbreviation"] = abbrev; // Add the new abbreviation field
            }
        });

        // Set global data and it's cache
        global_data = data;
        global_data_cache = data;
        console.log(global_data)



        // Draw Bars
        drawBarsAndLabels(data);

        // This sets an event listener for the checkbox
        d3.selectAll(".myCheckbox").on("change", filterData);

        // Gets the y value of the lowest legend so we can position our other legends accordingly
        var lowestLegend;

        // Legend Object
        const legend = g => g.append("g")
            .selectAll("g")
            .data(mortality_columns.slice().reverse())
            .enter().append("g")
            .attr("transform", function(d, i)
            {
                if (i === 2)
                {lowestLegend = (i - (mortality_columns.length - 1) / 2) * 20;}
                return `translate(${innerWidth/250000 - innerWidth/8},${(i - (mortality_columns.length - 1) / 2) * 20 })`;
            } )
            .call(g => g.append("rect")
                .attr("width", 18)
                .attr("height", 18)
                .attr("fill", zScale))
            .call(g => g.append("text")
                .attr("x", 24)
                .attr("y", 9)
                .attr("dy", "0.35em")
                .style("font-size","10px")
                .style('fill', 'darkOrange')
                .text(d => d));

        // Legend for the colors of country names
        var cntryLegends = g => g.append("g")
            .selectAll("g")
            .data(devLevel)
            .enter().append("g")
            .attr("transform", (d, i) => `translate(-75,${lowestLegend + 75 + i * 15})`)
            .call(g => g.append("text")
                .attr("x", 24)
                .attr("y", 9)
                .attr("dy", "0.35em")
                .style("font-size","10px")
                .style('fill', (d,i) => colorArr[i])
                .text(d => d));


        //////////////////////////////////////////////
        // Application Method calls
        /////////////////////////////////////////////

        // setup the width and height
        setup();

        // Draw the legends
        svg.append("g")
            .call(legend);

        svg.append("g")
            .call(cntryLegends);

    });
}

/**
 * This function is used to create a string of the measures that a country is undertaking
 * @param d
 */
function findMeasures(d) {

    console.log(d);

    var outString = "";
    if (d['Measure 1 - Expanded Coverage of comprehensive prenatal care'] === '1')
        outString = "1";
    if (d["Measure  2 - Expanded Coverage of obstetric care"] === '1') {
        if (outString.length > 0)
            outString = outString + ", 2";
        else
            outString = "2";
    }
    if (d['Measure 3 - Expanded Coverage of Essential post-partum and Newborn care'] === '1'){
        if (outString.length > 0)
            outString = outString + ", 3";
        else
            outString = "3";
    }

    if (d['Measure 4 - Expanded access to effective contraception'] === '1'){
        if (outString.length > 0)
            outString = outString + ", 4";
        else
            outString = "4";
    }
    if (d['Measure 5 - Expanded Access to safe abortion care, including Post-Abortion care'] === '1'){
        if (outString.length > 0)
            outString = outString + ", 5";
        else
            outString = "5";
    }
    if (d['Measure 6 - Expanded Recruitment and Training of Skilled Birth Attendants'] === '1'){
        if (outString.length > 0)
            outString = outString + ", 6";
        else
            outString = "6";
    }
    console.log(outString);
    return outString;
}

function drawBarsAndLabels(myData) {
    // X scale
    xScale = d3.scaleBand()
        .range([0, 2 * Math.PI])    // X axis goes from 0 to 2pi = all around the circle. If I stop at 1Pi, it will be around a half circle
        .align(0)                  // This does nothing ?
        .domain(myData.map(function (d) {
            return d.Country;
        })); // The domain of the X axis is the list of states.

    // Y scale
    yScale = d3.scaleRadial()
        .range([innerRadius, outerRadius])
        .domain([0, 1000]); // Domain of Y is from 0 to the max seen in the data

    // Z scale for colors
    zScale = d3.scaleOrdinal()
        .domain(mortality_columns)
        .range(["#e0d200", "#bc5090", "#003f5c"]);

    // Under 5 mortality rate bars
    svg.append("g")
        .selectAll("path")
        .data(myData)
        .enter()
        .append("path")
        .attr("fill", zScale('Under-five mortality rate (probability of dying by age 5 per 1000 live births)'))
        .attr("d", d3.arc()
            // Now draw the bars using the d3 arc object
            .innerRadius(innerRadius)
            .outerRadius(function (d) {
                return yScale(d['Under-five mortality rate (probability of dying by age 5 per 1000 live births)']);
            })
            .startAngle(function (d) {
                return xScale(d.Country);
            })
            .endAngle(function (d) {
                return xScale(d.Country) + xScale.bandwidth() + 0.001;
            })
            .padAngle(0.01)
            .padRadius(innerRadius))
        .append("svg:title")
        .text(function (d) {return d['Under-five mortality rate (probability of dying by age 5 per 1000 live births)'];});

    // Under 1 infant mortality rate bars
    svg.append("g")
        .selectAll("path")
        .data(myData)
        .enter()
        .append("path")
        .attr("fill", zScale('Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)'))
        .attr("d", d3.arc()
            // Now draw the bars using the d3 arc object
            .innerRadius(innerRadius)
            .outerRadius(function (d) {
                return yScale(d['Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)']);
            })
            .startAngle(function (d) {
                return xScale(d.Country);
            })
            .endAngle(function (d) {
                return xScale(d.Country) + xScale.bandwidth() - 0.008;
            })
            .padAngle(0.01)
            .padRadius(innerRadius))
        .append("svg:title")
        .text(function (d) {return d['Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)'];});

    // Neonatal
    svg.append("g")
        .selectAll("path")
        .data(myData)
        .enter()
        .append("path")
        .attr("fill", zScale('Neonatal mortality rate (per 1000 live births)'))
        .attr("d", d3.arc()
            // Now draw the bars using the d3 arc object
            .innerRadius(innerRadius)
            .outerRadius(function (d) {
                return yScale(d['Neonatal mortality rate (per 1000 live births)']);
            })
            .startAngle(function (d) {
                return xScale(d.Country);
            })
            .endAngle(function (d) {
                return xScale(d.Country) + xScale.bandwidth() - 0.015;
            })
            .padAngle(0.01)
            .padRadius(innerRadius))
        .append("svg:title")
        .text(function (d) {
            return d['Neonatal mortality rate (per 1000 live births)'];
        });

    // Add the country labels
    svg.append("g")
        .selectAll("g")
        .data(myData)
        .enter()
        .append("g")
        .attr("id", "country_legend")
        .attr("text-anchor", function (d) {
            return (xScale(d.Country) + xScale.bandwidth() / 2 + Math.PI) % (2 * Math.PI) < Math.PI ? "end" : "start";
        })
        .attr("transform", function (d) {
            // draw the names using the x scale and circle logic for positioning
            return "rotate(" + ((xScale(d.Country) + xScale.bandwidth() / 2) * 180 / Math.PI - 90) + ")" + "translate(" +
                innerRadius *0.92 + ",0)";
        })
        .append("text")
        .text(function (d) {
            return (d.Abbreviation)
        })
        .attr("transform", function (d) {
            return (xScale(d.Country) + xScale.bandwidth() / 2 + Math.PI) % (2 * Math.PI) < Math.PI ? "rotate(180)" : "rotate(0)";
        })
        .style("font-size", "9px")
        .style('fill', d => cntryColors[d.Development_level])
        .attr("alignment-baseline", "middle")
        .on("mouseover", function(d) {
            // make it white & bigger
            d3.select(this).style("fill",'white');
            d3.select(this).style("font-size","13px");

            // Build the part of the string for measures
            var measureString = findMeasures(d);
            if (measureString.length === 0)
                measureString = "No Measures Implemented";
            else
                measureString = "Measures Implemented: " + measureString;

            // Something about development?

            // Build the overall string
            const outString = "     " + d.Country + ", " + d.Region + ".\n       " + measureString;
            // Make the tooltip visible
            tooltip.transition()
                .duration(200)
                .style("opacity", 1);
            tooltip	.html(outString)
                .style("left", (d3.event.pageX) + "px")
                .style("top", (d3.event.pageY - 28) + "px");
        })
        .on("mouseout", function(d) {

            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
            d3.select(this).style("font-size","9px");
            d3.select(this).style("fill",d => cntryColors[d.Development_level]);
        });
}