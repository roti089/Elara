/* If Chart.js can't load (offline / blocked CDN) don't let that break the rest of the page */
if (typeof Chart === "undefined") {
    window.Chart = function () { this.update = function () {}; this.destroy = function () {}; };
    window.Chart.defaults = { color: "", font: {}, plugins: { legend: { labels: {} } } };
}

/* ==========================================================
                    ELARA ANALYTICS JS
========================================================== */

"use strict";


/* ==========================================================
                    INITIALIZATION
========================================================== */

document.addEventListener("DOMContentLoaded", function () {

    console.log("Elara Analytics JS Loaded!");

    initializeAnalytics();

});


/* ==========================================================
                    MAIN INITIALIZATION
========================================================== */

function initializeAnalytics() {

    initializeSearch();

    initializeNotifications();

    initializeLogout();

    initializePeriodSelector();

    initializeEnergyChart();

    initializeDeviceInteractions();

    initializeActivityInteractions();

    updateAnalytics();

}


/* ==========================================================
                    SEARCH
========================================================== */

function initializeSearch() {

    const searchInput = document.getElementById("analyticsSearch");

    if (!searchInput) {

        console.log("Analytics search input not found.");

        return;

    }

    searchInput.addEventListener("input", function () {

        const searchValue =
            searchInput.value.toLowerCase().trim();

        const devices =
            document.querySelectorAll(".analytics-device");

        devices.forEach(function (device) {

            const deviceText =
                device.textContent.toLowerCase();

            if (deviceText.includes(searchValue)) {

                device.style.display = "flex";

            } else {

                device.style.display = "none";

            }

        });

    });

}


/* ==========================================================
                    THEME
========================================================== */

function initializeTheme() {

    const themeButton =
        document.getElementById("themeBtn");

    if (!themeButton) {

        console.log("Theme button not found.");

        return;

    }

    const savedTheme =
        localStorage.getItem("elara-theme");

    if (savedTheme === "light") {

        document.body.classList.add("light-mode");

        updateThemeIcon(themeButton, true);

    }

    themeButton.addEventListener("click", function () {

        document.body.classList.toggle("light-mode");

        const isLight =
            document.body.classList.contains("light-mode");

        localStorage.setItem(
            "elara-theme",
            isLight ? "light" : "dark"
        );

        updateThemeIcon(themeButton, isLight);

    });

}


/* ==========================================================
                    THEME ICON
========================================================== */

function updateThemeIcon(button, isLight) {

    const icon = button.querySelector("i");

    if (!icon) return;

    if (isLight) {

        icon.classList.remove("fa-moon");

        icon.classList.add("fa-sun");

    } else {

        icon.classList.remove("fa-sun");

        icon.classList.add("fa-moon");

    }

}


/* ==========================================================
                    NOTIFICATIONS
========================================================== */

function initializeNotifications() {

    const notificationButton =
        document.getElementById("notificationBtn");

    if (!notificationButton) {

        console.log("Notification button not found.");

        return;

    }

    notificationButton.addEventListener("click", function () {

        showNotification(
            "Analytics updated successfully.",
            "success"
        );

    });

}


/* ==========================================================
                    NOTIFICATION SYSTEM
========================================================== */

function showNotification(message, type = "success") {

    let container =
        document.getElementById("analyticsToastContainer");

    if (!container) {

        container = document.createElement("div");

        container.id =
            "analyticsToastContainer";

        container.style.position = "fixed";

        container.style.top = "25px";

        container.style.right = "25px";

        container.style.zIndex = "10000";

        container.style.display = "flex";

        container.style.flexDirection = "column";

        container.style.gap = "12px";

        document.body.appendChild(container);

    }


    const toast =
        document.createElement("div");

    toast.style.minWidth = "280px";

    toast.style.padding = "16px 20px";

    toast.style.borderRadius = "16px";

    toast.style.color = "#fff";

    toast.style.fontFamily = "Outfit, sans-serif";

    toast.style.fontSize = "14px";

    toast.style.boxShadow =
        "0 15px 40px rgba(0,0,0,.35)";

    toast.style.backdropFilter =
        "blur(20px)";

    toast.style.transform =
        "translateX(120%)";

    toast.style.opacity = "0";

    toast.style.transition =
        ".35s ease";


    if (type === "success") {

        toast.style.background =
            "linear-gradient(135deg,#22C55E,#16A34A)";

    }

    else if (type === "warning") {

        toast.style.background =
            "linear-gradient(135deg,#FBBF24,#D97706)";

    }

    else {

        toast.style.background =
            "linear-gradient(135deg,#FB7185,#E11D48)";

    }


    toast.innerHTML = `
        <i class="fa-solid fa-circle-check"
           style="margin-right:8px;">
        </i>

        ${message}
    `;


    container.appendChild(toast);


    setTimeout(function () {

        toast.style.transform =
            "translateX(0)";

        toast.style.opacity = "1";

    }, 50);


    setTimeout(function () {

        toast.style.transform =
            "translateX(120%)";

        toast.style.opacity = "0";

        setTimeout(function () {

            toast.remove();

        }, 350);

    }, 3000);

}


/* ==========================================================
                    LOGOUT
========================================================== */

function initializeLogout() {

    const logoutButton =
        document.querySelector(".logout");

    if (!logoutButton) {

        console.log("Logout button not found.");

        return;

    }

    logoutButton.addEventListener("click", function () {

        const confirmLogout =
            confirm("Are you sure you want to logout?");

        if (!confirmLogout) return;

        localStorage.removeItem("elara-theme");

        showNotification(
            "Logging out...",
            "success"
        );

        setTimeout(function () {

            window.location.href =
                "../Interface/Loginpage.html";

        }, 1000);

    });

}


/* ==========================================================
                PERIOD SELECTOR
========================================================== */

function initializePeriodSelector() {

    const periodSelector =
        document.getElementById("analyticsPeriod");

    if (!periodSelector) {

        console.log("Period selector not found.");

        return;

    }

    periodSelector.addEventListener("change", function () {

        const selectedPeriod =
            periodSelector.value;

        updateEnergyChart(selectedPeriod);

        updateAnalyticsValues(selectedPeriod);

    });

}


/* ==========================================================
                    ENERGY CHART
========================================================== */

let energyChart = null;


function initializeEnergyChart() {

    const canvas =
        document.getElementById("energyChart");

    if (!canvas) {

        console.log("Energy chart canvas not found.");

        return;

    }

    if (typeof Chart === "undefined") {

        console.error(
            "Chart.js is not loaded."
        );

        return;

    }

    createEnergyChart("week");

}


/* ==========================================================
                    CREATE ENERGY CHART
========================================================== */

function createEnergyChart(period) {

    const canvas =
        document.getElementById("energyChart");

    if (!canvas) return;


    const ctx =
        canvas.getContext("2d");


    if (energyChart) {

        energyChart.destroy();

    }


    const chartData =
        getEnergyData(period);


    const gradient =
        ctx.createLinearGradient(
            0,
            0,
            0,
            350
        );


    gradient.addColorStop(
        0,
        "rgba(124,108,255,.45)"
    );


    gradient.addColorStop(
        1,
        "rgba(124,108,255,.02)"
    );


    energyChart =
        new Chart(ctx, {

            type: "line",

            data: {

                labels:
                    chartData.labels,

                datasets: [

                    {

                        label:
                            "Energy Usage",

                        data:
                            chartData.values,

                        borderColor:
                            "#7C6CFF",

                        backgroundColor:
                            gradient,

                        borderWidth: 3,

                        fill: true,

                        tension: .4,

                        pointBackgroundColor:
                            "#64E4FF",

                        pointBorderColor:
                            "#FFFFFF",

                        pointBorderWidth: 2,

                        pointRadius: 5,

                        pointHoverRadius: 8

                    }

                ]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                interaction: {

                    intersect: false,

                    mode: "index"

                },

                plugins: {

                    legend: {

                        display: false

                    },

                    tooltip: {

                        backgroundColor:
                            "#111426",

                        titleColor:
                            "#FFFFFF",

                        bodyColor:
                            "#A7B2D1",

                        borderColor:
                            "rgba(255,255,255,.08)",

                        borderWidth: 1,

                        padding: 12,

                        callbacks: {

                            label: function (context) {

                                return (
                                    " " +
                                    context.parsed.y +
                                    " kWh"
                                );

                            }

                        }

                    }

                },

                scales: {

                    x: {

                        grid: {

                            color:
                                "rgba(255,255,255,.05)"

                        },

                        ticks: {

                            color:
                                "#A7B2D1"

                        }

                    },

                    y: {

                        beginAtZero: true,

                        grid: {

                            color:
                                "rgba(255,255,255,.05)"

                        },

                        ticks: {

                            color:
                                "#A7B2D1",

                            callback: function (value) {

                                return value + " kWh";

                            }

                        }

                    }

                }

            }

        });

}


/* ==========================================================
                    ENERGY DATA
========================================================== */

function getEnergyData(period) {

    const D = window.ElaraData;
    const range = period === "today" ? "today" : period === "month" ? "month" : "week";
    const e = D.energy.compute(range);
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let labels = [];

    if (range === "today") {
        for (let h = 0; h < 24; h++) labels.push(String(h).padStart(2, "0") + ":00");
    } else {
        const n = e.series.length;
        for (let i = n - 1; i >= 0; i--) {
            const d = D.util.addDays(new Date(), -i);
            labels.push(range === "week" ? names[d.getDay()] : d.getDate() + "/" + (d.getMonth() + 1));
        }
    }

    return { labels: labels, values: e.series.map(v => +v.toFixed(2)) };
}


/* ==========================================================
                    UPDATE CHART
========================================================== */

function updateEnergyChart(period) {

    createEnergyChart(period);

    showNotification(
        "Energy chart updated.",
        "success"
    );

}


/* ==========================================================
                    ANALYTICS VALUES
========================================================== */

function updateAnalyticsValues(period) {

    const D = window.ElaraData;
    if (!D) return;

    const range = period === "today" ? "today" : period === "month" ? "month" : "week";
    const label = { today: "Today", week: "This week", month: "This month" }[range];
    const e = D.energy.compute(range);
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const panelByTitle = (re) => Array.from(document.querySelectorAll(".panel")).find(p => {
        const h = p.querySelector("h2"); return h && re.test(h.textContent);
    });

    /* ---- stat cards ---- */
    const setCard = (id, value, note) => {
        const el = $(id); if (!el) return;
        el.textContent = value;
        const p = el.parentElement.querySelector("p"); if (p && note) p.textContent = note;
    };
    setCard("totalUsage", e.total.toFixed(1) + " kWh", label);
    setCard("estimatedCost", "R" + e.cost.toFixed(2), "At R" + e.tariff.toFixed(2) + " per kWh");
    setCard("activeDevices", e.active, "of " + e.deviceCount + " devices are on");
    setCard("efficiencyValue", e.efficiency + "%", e.efficiency >= 80 ? "Excellent performance" : e.efficiency >= 60 ? "Good performance" : "Room to improve");

    /* ---- efficiency panel ---- */
    const ep = panelByTitle(/^\s*Efficiency/i);
    if (ep) {
        const verdict = e.efficiency >= 80 ? "Excellent" : e.efficiency >= 60 ? "Good" : "Needs attention";
        const h3 = ep.querySelector(".efficiency-score h3"), p = ep.querySelector(".efficiency-score p");
        if (h3) h3.textContent = verdict;
        if (p) p.textContent = e.efficiency >= 80 ? "Your home is operating efficiently." : e.efficiency >= 60 ? "Your home is doing well. A few habits could help." : "Try shifting heavy appliances out of the evening peak.";
        const rows = ep.querySelectorAll(".efficiency-details strong");
        if (rows[0]) rows[0].textContent = e.saving + "%";
        if (rows[1]) rows[1].textContent = e.deviceEff + "%";
        if (rows[2]) rows[2].textContent = e.autoPct + "%";
    }

    /* ---- device consumption ---- */
    const dp = panelByTitle(/Device Consumption/i);
    if (dp) {
        const box = dp.querySelector(".device-analytics");
        const top = e.devices.filter(d => d.kwh > 0).slice(0, 4);
        box.innerHTML = top.length ? top.map(d =>
            '<div class="analytics-device" data-href="dashboard-smart-home.html" style="cursor:pointer"><div class="analytics-device-left"><div class="analytics-icon"><i class="fa-solid ' + esc(d.icon) + '"></i></div>' +
            '<div><h4>' + esc(d.name) + '</h4><p>' + esc(d.room) + '</p></div></div>' +
            '<div class="analytics-value"><strong>' + d.kwh.toFixed(1) + ' kWh</strong><span>' + (e.total ? Math.round(d.kwh / e.total * 100) : 0) + '%</span></div></div>'
        ).join("") : '<p style="opacity:.65;padding:18px">No device usage recorded for this period yet.</p>';
    }

    /* ---- room usage ---- */
    const rp = panelByTitle(/Room Usage/i);
    if (rp) {
        const box = rp.querySelector(".room-analytics");
        const rooms = e.rooms.slice(0, 4);
        box.innerHTML = rooms.length ? rooms.map(r => {
            const pct = e.total ? Math.round(r.kwh / e.total * 100) : 0;
            return '<div class="room-stat"><div><h4>' + esc(r.room) + '</h4><p>' + r.kwh.toFixed(1) + ' kWh</p></div><strong>' + pct + '%</strong></div>' +
                   '<div class="progress"><span style="width:' + pct + '%"></span></div>';
        }).join("") : '<p style="opacity:.65;padding:18px">No room usage recorded for this period yet.</p>';
    }

    /* ---- usage trend ---- */
    const tp = panelByTitle(/Usage Trend/i);
    if (tp) {
        const order = ["morning", "afternoon", "evening", "night"];
        tp.querySelectorAll(".trend-card strong").forEach((el, i) => {
            el.textContent = (e.total ? Math.round(e.parts[order[i]] / e.total * 100) : 0) + "%";
        });
    }

    /* ---- recent analytics (insights computed from the data) ---- */
    const ap = panelByTitle(/Recent Analytics/i);
    if (ap) {
        const list = ap.querySelector(".activity-list");
        const insights = [];
        if (e.change !== null) {
            insights.push({ icon: e.change <= 0 ? "fa-arrow-trend-down" : "fa-arrow-trend-up", title: e.change <= 0 ? "Energy usage decreased" : "Energy usage increased",
                text: "Your household used " + Math.abs(e.change) + "% " + (e.change <= 0 ? "less" : "more") + " energy than the previous " + (range === "today" ? "day" : range) + ".", when: label });
        }
        const top = e.devices[0];
        if (top && top.kwh > 0) insights.push({ icon: "fa-bolt", title: top.name + " is your biggest consumer",
            text: top.name + " used " + top.kwh.toFixed(1) + " kWh, " + Math.round(top.kwh / e.total * 100) + "% of the total.", when: label });
        if (e.total > 0) {
            const peak = Object.keys(e.parts).sort((a, b) => e.parts[b] - e.parts[a])[0];
            insights.push({ icon: "fa-clock", title: "Peak usage in the " + peak,
                text: Math.round(e.parts[peak] / e.total * 100) + "% of your energy is used in the " + peak + ".", when: label });
        }
        list.innerHTML = insights.length ? insights.map(i =>
            '<div class="activity-item"><div class="activity-left"><div class="activity-icon"><i class="fa-solid ' + i.icon + '"></i></div>' +
            '<div class="activity-info"><h4>' + esc(i.title) + '</h4><p>' + esc(i.text) + '</p></div></div><span class="activity-time">' + esc(i.when) + '</span></div>'
        ).join("") : '<div class="activity-item"><div class="activity-left"><div class="activity-icon"><i class="fa-solid fa-circle-info"></i></div><div class="activity-info"><h4>No insights yet</h4><p>Insights appear once your devices have been used for a while.</p></div></div></div>';
    }

    /* ---- banner: sample data / no data ---- */
    let banner = document.getElementById("dataBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "dataBanner"; banner.className = "data-banner";
        const stats = document.querySelector(".stats");
        if (stats) stats.parentNode.insertBefore(banner, stats);
    }
    if (e.sample) {
        banner.innerHTML = '<i class="fa-solid fa-flask"></i><span>You are looking at <strong>sample data</strong> (30 days of made-up usage).</span><button type="button" data-banner="clear">Clear sample data</button>';
        banner.style.display = "flex";
    } else if (!e.hasData) {
        banner.innerHTML = '<i class="fa-solid fa-circle-info"></i><span>No usage recorded yet. Your numbers build up as you switch devices on the Smart Home page.</span><button type="button" data-banner="sample">Load sample data</button>';
        banner.style.display = "flex";
    } else {
        banner.style.display = "none";
    }
}


/* ==========================================================
                    DEVICE INTERACTIONS
========================================================== */

function initializeDeviceInteractions() { /* rows are rendered (and made clickable) by updateAnalyticsValues */ }


/* ==========================================================
                    ACTIVITY INTERACTIONS
========================================================== */

function initializeActivityInteractions() { /* insights are rendered by updateAnalyticsValues */ }


/* ==========================================================
                    UPDATE ANALYTICS
========================================================== */

function updateAnalytics() {

    const currentPeriod =
        document.getElementById(
            "analyticsPeriod"
        );


    if (currentPeriod) {

        updateAnalyticsValues(
            currentPeriod.value
        );

    }

}


/* ==========================================================
                    LIVE UPDATE
========================================================== */

function simulateLiveUpdate() { /* removed: numbers now come from real device history */ }


/* ==========================================================
                RUN LIVE UPDATE EVERY 30 SEC
========================================================== */

setInterval(function () {

    simulateLiveUpdate();

}, 30000);


/* ==========================================================
                    RESIZE CHART
========================================================== */

window.addEventListener(
    "resize",
    function () {

        if (energyChart) {

            energyChart.resize();

        }

    }
);


/* ==========================================================
                    CONSOLE CHECK
========================================================== */

console.log(
    "Elara Analytics JavaScript is ready."
);

/* ==========================================================
   Efficiency circle follows the value shown in the stat card
========================================================== */
(function () {
    var value = document.getElementById("efficiencyValue");
    var circle = document.querySelector(".efficiency-circle");
    if (!value || !circle) return;

    function sync() {
        var n = parseInt(value.textContent, 10);
        if (isNaN(n)) return;
        circle.style.setProperty("--eff", (n * 3.6) + "deg");
        var label = circle.querySelector("span");
        if (label) label.textContent = n + "%";
    }
    new MutationObserver(sync).observe(value, { childList: true, characterData: true, subtree: true });
    sync();
})();


/* ==========================================================
   Analytics: banner buttons + clickable device rows
========================================================== */
document.addEventListener("click", function (ev) {
    const b = ev.target.closest("[data-banner]");
    if (b) {
        if (b.dataset.banner === "sample") ElaraData.energy.generateSample(30);
        else ElaraData.energy.clear();
        updateAnalytics();
        const period = document.getElementById("analyticsPeriod");
        updateEnergyChart(period ? period.value : "week");
        if (window.ElaraUI) ElaraUI.toast(b.dataset.banner === "sample" ? "Sample data loaded." : "Sample data cleared.", "info");
        return;
    }
    const row = ev.target.closest(".analytics-device[data-href]");
    if (row) window.location.href = row.dataset.href;
});
