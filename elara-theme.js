// ==========================================================
// ELARA GLOBAL THEME
// ==========================================================

function applyElaraTheme() {

    const savedTheme =
        localStorage.getItem("elaraTheme") || "dark";


    if (savedTheme === "light") {

        document.body.classList.add("light-theme");

    }

    else if (savedTheme === "dark") {

        document.body.classList.remove("light-theme");

    }

    else if (savedTheme === "system") {

        const prefersLight =
            window.matchMedia(
                "(prefers-color-scheme: light)"
            ).matches;

        document.body.classList.toggle(
            "light-theme",
            prefersLight
        );

    }

}


// Apply theme as soon as the page loads
applyElaraTheme();


// ==========================================================
// SYSTEM THEME CHANGES
// ==========================================================

const systemTheme =
    window.matchMedia("(prefers-color-scheme: light)");


systemTheme.addEventListener("change", () => {

    const savedTheme =
        localStorage.getItem("elaraTheme");

    if (savedTheme === "system") {

        applyElaraTheme();

    }

});

