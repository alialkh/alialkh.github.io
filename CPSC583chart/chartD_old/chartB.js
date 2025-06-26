/////////////////////
//  Chart B - CPSC 583 - Sedat Islam & Ali Al-Khaz'Aly
//  Double Circular Barplot
//  This code was adapted from the online D3 tutorials sourced at :
// https://www.d3-graph-gallery.com/circular_barplot.html?fbclid=IwAR1oYWzsSank3S_DRk3jjdPhx4hgD5imgMuvIUV_8t9NszwAOkq7jTLUiis
//////////////////////


// Create spacing variables
var margin = {top: 0, right: 0, bottom: 0, left: 0},
    width = 1500 - margin.left - margin.right,
    height = 1500 - margin.top - margin.bottom,
    innerRadius = 250,
    outerRadius = Math.min(width, height) / 2;   // the outerRadius goes from the middle of the SVG area to the border

// append the svg object
var svg = d3.select("#my_dataviz")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + (width / 2 + margin.left) + "," + (height / 2 + margin.top) + ")");


window.onload = run();

function run() {

    d3.csv("../dataset.csv", function (data) {

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

        // X scale
        var x = d3.scaleBand()
            .range([0, 2 * Math.PI])    // X axis goes from 0 to 2pi = all around the circle. If I stop at 1Pi, it will be around a half circle
            .align(0)                  // This does nothing ?
            .domain(data.map(function (d) {
                return d.Country;
            })); // The domain of the X axis is the list of states.

        // Y scale
        var y = d3.scaleRadial()
            .range([innerRadius, outerRadius])
            .domain([0, 500]); // Domain of Y is from 0 to the max seen in the data

        // Inner Y Scale
        var innerYScale = d3.scaleRadial()
            .range([innerRadius, 0])   // Domain will be defined later.
            .domain([0, 100]);

        // Z scale for colors
        var z = d3.scaleOrdinal()
            .domain(data.columns.slice(4, 7))
            .range(["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56", "#d0743c", "#ff8c00"]);

        // Javascript dictionary for mapping region development to a specific color
        var cntryColors = {
            "More dev. region" : "#00c51b",
            "Less dev. region" : "#c5000b",
        };

        // Arrays for easier access in legends parameter
        var devLevel = [ "Highly Developed Region", "Low Developed Region"];
        var colorArr = [cntryColors["More dev. region"], cntryColors["Less dev. region"]];


        // Y value of the farthest down legend from the 3 bar color legends
        var lowestLegend;


        // Legend Object
        var legend = g => g.append("g")
            .selectAll("g")
            .data([{text: "Boys mortality count per 1000", colour: "#0b0488"}, {text: "Girls mortality count per 1000", colour: "#a000a6"}])
            .enter().append("g")
            .attr("transform", function(d, i)
            {
                if (i === 1)
                {lowestLegend = (i - (data.columns.slice(4,7).length - 1) / 2) * 20;}
                return `translate(-60,${(i - (data.columns.slice(4,7).length - 1) / 2) * 20 })`;
            } )
            .call(g => g.append("rect")
                .attr("width", 18)
                .attr("height", 18)
                .attr("fill", d => d.colour))
            .call(g => g.append("text")
                .attr("x", 24)
                .attr("y", 9)
                .attr("dy", "0.35em")
                .style("font-size","10px")
                .style('fill', 'darkOrange')
                .text(d => d.text));

        // Legend for the country names color
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

        // Add the first series
        svg.append("g")
            .selectAll("path")
            .data(data)
            .enter()
            .append("path")
            .attr("fill", "#0b0488")
            .attr("d", d3.arc()
            // Now draw the bars using the d3 arc object
                .innerRadius(innerRadius)
                .outerRadius(function (d) {
                    return y(d['Column1']);
                })
                .startAngle(function (d) {
                    return x(d.Country);
                })
                .endAngle(function (d) {
                    return x(d.Country) + x.bandwidth();
                })
                .padAngle(0.01)
                .padRadius(innerRadius))
            .append("svg:title")    // Hovering reveals values
            .text(function (d) {return d.Column1});

        // Add the labels
        svg.append("g")
            .selectAll("g")
            .data(data)
            .enter()
            .append("g")
            .attr("text-anchor", function (d) {
                return (x(d.Country) + x.bandwidth() / 2 + Math.PI) % (2 * Math.PI) < Math.PI ? "end" : "start";
            })
            .attr("transform", function (d) {
                // draw the names using the x scale and circle logic for positioning
                return "rotate(" + ((x(d.Country) + x.bandwidth() / 2) * 180 / Math.PI - 90) + ")" + "translate(" +
                    ((y(d["Column1"])) + 10) + ",0)";
            })
            .append("text")
            .text(function (d) {
                return (d.Country)
            })
            .attr("transform", function (d) {
                return (x(d.Country) + x.bandwidth() / 2 + Math.PI) % (2 * Math.PI) < Math.PI ? "rotate(180)" : "rotate(0)";
            })
            .style("font-size", "9px")
            .style('fill', d => cntryColors[d.Development_level])
            .attr("alignment-baseline", "middle");

        // Add the second series
        svg.append("g")
            .selectAll("path")
            .data(data)
            .enter()
            .append("path")
            .attr("fill", "#a000a6")
            .attr("d", d3.arc()
            // Now draw the bars using the d3 arc object
                .innerRadius(function (d) {
                    return innerYScale(0)
                })
                .outerRadius(function (d) {
                    return innerYScale(d['Column2']);
                })
                .startAngle(function (d) {
                    return x(d.Country);
                })
                .endAngle(function (d) {
                    return x(d.Country) + x.bandwidth();
                })
                .padAngle(0.01)
                .padRadius(innerRadius))
            .append("svg:title")    // Hovering reveals values
            .text(function (d) {return d.Column2});

        // Create the legends
        svg.append("g")
            .call(legend);
        svg.append("g")
            .call(cntryLegends);
    });


}