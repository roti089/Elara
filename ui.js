const container = document.getElementById('container');
const registerBtn = document.getElementById('show-register');
const loginBtn = document.getElementById('show-login');

if (registerBtn && loginBtn && container) {
    registerBtn.addEventListener('click', () => {
        container.classList.add("active");
    });

    loginBtn.addEventListener('click', () => {
        container.classList.remove("active");
    });
}