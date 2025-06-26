/**
 * Application Entry Point
 */
window.onload = createVis();


// get the data
function createVis() {
    d3.csv("../dataset.csv", function (error, data) {
        if (error) throw error;

        data = data.filter(d => d.Country !== "");

        // data = data.sort(function (a, b) {
        //     return b['Under-five mortality rate (probability of dying by age 5 per 1000 live births)']
        //         - a['Under-five mortality rate (probability of dying by age 5 per 1000 live births)']
        // });

        // We will add the abbreviation field for each country
        data.forEach(function (d) {
            var abbrev = getiso3(getCountryCode(d.Country));
            d["Abbreviation"] = abbrev; // Add the new abbreviation field
        });

        devCountryArray = data.map(function (d) {
            return {
                key : d.Abbreviation,
                value: d['Development_level']
            }
        });
        console.log(devCountryArray)

        // Javascript dictionary for mapping region development to a specific color
        var devColours = {
            "More dev. region": "#00c0ff",
            "Less dev. region": "#c5000b",
        };

        // set the dimensions and margins of the graph
        var margin = {top: 20, right: 20, bottom: 30, left: 40},
            width = 1920 - margin.left - margin.right,
            height = 500 - margin.top - margin.bottom;

        // set the ranges
        var x = d3.scaleBand()
            .range([0, width])
            .padding(0.5);
        var y = d3.scaleLinear()
            .domain([0,130])
            .range([height, 0]);

        // append the svg object to the body of the page
        // append a 'group' element to 'svg'
        // moves the 'group' element to the top left margin
        var svg = d3.select("#my_dataviz")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform",
                "translate(" + margin.left + "," + margin.top + ")");

        // Scale the range of the data in the domains
        x.domain(data.map(function (d) {
            return d.Abbreviation;
        }));
        y.domain([0, 130]);

        // Child bars
        svg.selectAll(".bar1")
            .data(data)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", function (d) {
                return x(d.Abbreviation);
            })
            .attr("width", x.bandwidth())
            .attr("y", function (d) {
                return y(d['Under-five mortality rate (probability of dying by age 5 per 1000 live births)']);
            })
            .attr("height", function (d) {
                return (height - y(d['Under-five mortality rate (probability of dying by age 5 per 1000 live births)']));
            })
            .style("fill", "#003f5c")
            .append("svg:title")    // Hovering reveals values
            .text(function (d) {
                return d['Under-five mortality rate (probability of dying by age 5 per 1000 live births)'];
            });

        // Infant
        svg.selectAll(".bar2")
            .data(data)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", function (d) {
                return x(d.Abbreviation);
            })
            .attr("width", x.bandwidth())
            .attr("y", function (d) {
                return y(d['Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)']);
            })
            .attr("height", function (d) {
                return height - y(d['Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)']);
            })
            .style("fill", "#bc5090")
            .append("svg:title")    // Hovering reveals values
            .text(function (d) {
                return d['Infant mortality rate (probability of dying between birth and age 1 per 1000 live births)'];
            });

        // Neonatal
        svg.selectAll(".bar3")
            .data(data)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", function (d) {
                return x(d.Abbreviation);
            })
            .attr("width", x.bandwidth())
            .attr("y", function (d) {
                return y(d['Neonatal mortality rate (per 1000 live births)']);
            })
            .attr("height", function (d) {
                return height - y(d['Neonatal mortality rate (per 1000 live births)']);
            })
            .style("fill", "#e0d200")
            .append("svg:title")    // Hovering reveals values
            .text(function (d) {
                return d['Neonatal mortality rate (per 1000 live births)'];
            });

        // add the x Axis
        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("y", 0)
            .attr("x", 9)
            .attr("dy", ".35em")
            .attr("transform", "rotate(90)")
            .style("text-anchor", "start")
            .style("fill", function (d) {
                // console.log(d)
                const item = devCountryArray.find(function (e) {
                    return e.key === d;
                });
                return devColours[item.value];
            });

        // add the y Axis
        svg.append("g")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("fill", "red");



        // Create Legend
        svgContainer = d3.select("#legend");

        svgContainer.append("text")
            .attr("x", 70)
            .attr("y", 50)
            .style("text-anchor", "middle")
            .style("font-weight", "bold")
            .text("Types of Rooms");

        // Create top level <g></g>
        var legend = svgContainer.append('g')
            .attr('class', 'legend')

        legendNames = ["Neonatal Mortality", "Infant Mortality", "Child Mortality"];
        legendColours = ["#e0d200", "#bc5090", "#003f5c"];

        // Create the different colours fpr the legend
        legend.selectAll('rect')
            .data(legendNames)
            .enter()
            .append('rect')
            .attr('x', 0)
            .attr('y', function(d, i){
                return (i + 1) * 30;
            })
            .attr('width', 20)
            .attr('height', 20)
            .attr('fill', function (d, i) {
                return legendColours[i];
            });

        // Create the text labels for the different colours
        legend.selectAll('text')
            .data(legendNames)
            .enter()
            .append('text')
            .text(function(d){
                return d;
            })
            .attr('x', 40)
            .attr('y', function(d, i){
                return (i + 1) * 30;
            })
            .attr('text-anchor', 'start')
            .attr('alignment-baseline', 'hanging')
            .style("fill", "darkOrange");

    });

}