/* sections fade in as they scroll into view */
(function () {
    const reveals = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { reveals.forEach((r) => r.classList.add("active")); return; }
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("active"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -15% 0px" });
    reveals.forEach((r) => io.observe(r));
})();

/* ===========================================================
   ELARA MASCOT
=========================================================== */

(function () {
    if (!document.getElementById("mascot-wrap")) return;
    const wrap = document.getElementById("mascot-wrap");
    const headGroup = document.getElementById("head-group");
    const antennaGroup = document.getElementById("antenna-group");
    const pupilLeft = document.getElementById("pupil-left");
    const pupilRight = document.getElementById("pupil-right");
    const speechText = document.getElementById("speech-text");

    const eyeSockets = {
        left: { cx: 45, cy: 52 },
        right: { cx: 63, cy: 52 }
    };

    const MAX_PUPIL_OFFSET = 3;
    const MAX_HEAD_TILT = 8;

    let targetX = window.innerWidth - 80;
    let targetY = window.innerHeight - 80;
    let currentAngle = 0;

    document.addEventListener("mousemove", (e) => {
        targetX = e.clientX;
        targetY = e.clientY;
    });

    function svgPoint(clientX, clientY) {

        const rect = wrap.getBoundingClientRect();

        const headX = rect.left + rect.width * 0.5;
        const headY = rect.top + rect.height * 0.42;

        const dx = clientX - headX;
        const dy = clientY - headY;

        return {
            dx,
            dy,
            dist: Math.sqrt(dx * dx + dy * dy)
        };

    }

    function movePupil(pupil, socket, dx, dy, dist) {

        const amount = Math.min(1, dist / 400);

        const angle = Math.atan2(dy, dx);

        const ox = Math.cos(angle) * MAX_PUPIL_OFFSET * amount;
        const oy = Math.sin(angle) * MAX_PUPIL_OFFSET * amount;

        pupil.setAttribute("cx", socket.cx + ox);
        pupil.setAttribute("cy", socket.cy + oy);

    }

    function animate() {

        const { dx, dy, dist } = svgPoint(targetX, targetY);

        movePupil(pupilLeft, eyeSockets.left, dx, dy, dist);
        movePupil(pupilRight, eyeSockets.right, dx, dy, dist);

        const targetAngle = Math.max(
            -MAX_HEAD_TILT,
            Math.min(MAX_HEAD_TILT, dx / 30)
        );

        currentAngle += (targetAngle - currentAngle) * 0.15;

        headGroup.setAttribute(
            "transform",
            `rotate(${currentAngle.toFixed(2)} 54 62)`
        );

        antennaGroup.setAttribute(
            "transform",
            `rotate(${(currentAngle * 1.4).toFixed(2)} 54 26)`
        );

        requestAnimationFrame(animate);

    }

    animate();

    function blink() {

        [pupilLeft, pupilRight].forEach(p => {

            p.parentElement.style.transform = "scaleY(.15)";

        });

        setTimeout(() => {

            [pupilLeft, pupilRight].forEach(p => {

                p.parentElement.style.transform = "scaleY(1)";

            });

        }, 120);

        setTimeout(blink, 2600 + Math.random() * 2800);

    }

    setTimeout(blink, 1500);

    const tips = [

        "Welcome back!",
        "Today's tasks are ready.",
        "Energy usage looks great.",
        "Your smart home is online.",
        "Have a productive day!",
        "No overdue chores today.",
        "Everything is under control."

    ];

    wrap.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); wrap.click(); } });
    wrap.addEventListener("click", () => {

        speechText.textContent =
            tips[Math.floor(Math.random() * tips.length)];

        wrap.classList.add("talking");

        clearTimeout(wrap.timer);

        wrap.timer = setTimeout(() => {

            wrap.classList.remove("talking");

        }, 2000);

    });

})();