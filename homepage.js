/* ===========================================================
   ELARA MASCOT
=========================================================== */

(function () {

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
            p.parentElement.style.transformOrigin = "center";

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



/* ===========================================================
   ELARA WAVES BACKGROUND
=========================================================== */

paper.install(window);

const canvas = document.getElementById("bend");

paper.setup(canvas);

let h = window.innerHeight;
let w = window.innerWidth;

let horizon = h / 2;

const pathCounts = 10;
const pathPoints = 24;

const strokeWidth = 1.2;
const strokeColor = "#8B5CF6";

const speed = 0.9;
const offset = 7;
const delay = 0.9;

const frequency = [

0,-30,50,-50,-35,35,
0,-30,50,-50,-35,35,
0,-30,50,-50,-35,35,
0,-30,50,-50,-35,35

];

const paths = [];

initializePaths();



function initializePaths(){

    h = window.innerHeight;
    w = window.innerWidth;

    horizon = h/2;

    paper.project.activeLayer.removeChildren();

    paths.length = 0;

    for(let i=0;i<pathCounts;i++){

        const path = new paper.Path();

        path.add(new paper.Point(-10,h));
        path.add(new paper.Point(-10,horizon));

        for(let p=0;p<pathPoints-1;p++){

            path.add(

                new paper.Point(

                    w/(pathPoints-1)*p+p,

                    horizon+frequency[p]

                )

            );

        }

        path.add(new paper.Point(w+10,horizon));
        path.add(new paper.Point(w+10,h));

        path.strokeWidth=strokeWidth;

        path.strokeColor=strokeColor;

        path.shadowColor="#8B5CF6";
        path.shadowBlur=18;

        if(i===0){

            path.fillColor="rgba(255,255,255,.03)";

        }

        path.smooth();

        paths.push(path);

    }

}



view.onFrame=function(event){

    for(let p=0;p<pathCounts;p++){

        for(let s=0;s<pathPoints;s++){

            const value=(s%2)?-1:1;

            const segment=paths[p].segments[2+s];

            segment.point.y=

                horizon+

                Math.sin((event.time+s*delay)*speed)

                *

                (frequency[s]*value+(p*offset*value));

        }

    }

};



window.addEventListener("resize",()=>{

    view.viewSize=new paper.Size(

        window.innerWidth,

        window.innerHeight

    );

    initializePaths();

});

/*scroller*/
const title = document.querySelector(".background-title");

window.addEventListener("scroll", () => {

    const scroll = window.scrollY;

    title.style.transform =
        `translate(-50%, calc(-50% - ${scroll * 0.25}px))`;

});

const titles = document.querySelectorAll(".background-title");

window.addEventListener("scroll", () => {

    const scroll = window.scrollY;

    titles.forEach(title => {

        const section = title.parentElement;

        const rect = section.getBoundingClientRect();

        const progress = rect.top / window.innerHeight;

        title.style.transform =
        `translate(-50%, calc(-50% - ${progress * 80}px))`;

        title.style.opacity =
        Math.max(0, 0.05 - Math.abs(progress)*0.05);

    });

});

const observer = new IntersectionObserver(entries=>{

    entries.forEach(entry=>{

        if(entry.isIntersecting){

            entry.target.classList.add("show");

        }

    });

},{threshold:.25});

document.querySelectorAll(".fade-section").forEach(section=>{

    observer.observe(section);

});