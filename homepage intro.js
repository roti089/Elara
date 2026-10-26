const intro = document.getElementById("intro-screen");
const homepage = document.getElementById("homepage");

if (!sessionStorage.getItem("introPlayed")) {

    sessionStorage.setItem("introPlayed", "true");

    setTimeout(() => {

        intro.style.opacity = "0";

        homepage.style.opacity = "1";

        setTimeout(() => {

            intro.remove();

        },800);

    },4200);

}else{

    intro.remove();

    homepage.style.opacity="1";

}