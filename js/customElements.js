// custom-elements.js



class customFooter extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <footer class="bg-dark text-light py-5 footer-content">
        <div class="container footer-main">
            <div class="row">
                <div class="col-md-3">
                    <h3 class="theme-color">Contact Details</h3>
                    <p>Mrs. Agnes Ameh</p>
                    <p onclick="location.href='mailto:info@aamehlawfirm.ca'" class="mail-link">info@aamehlawfirm.ca </p>
                    <p>+1 587-355-9074</p>
                    <i class="fa-brands fa-square-facebook"></i>
                    <i class="fa-brands fa-instagram"></i>
                    <i class="fa-solid fa-map-location-dot"></i>
                </div>
                <div class="col-md-3">
                    <h3 class="theme-color">Services We Offer</h3>
                    <ul class=" footer-serviceList">
                        <li onclick="location.href='divorceSeparation.html'"><span class="footer-list-symbol">»</span> Divorce & Separation</li>
                        <li onclick="location.href='immigration.html'"><span class="footer-list-symbol">»</span> Immigration Law</li>
                        <li onclick="location.href='criminalMatters.html'"><span class="footer-list-symbol">»</span> Criminal Matters</li>
                        <li onclick="location.href='realEstate.html'"><span class="footer-list-symbol">»</span> Real Estate Law</li>
                        <li onclick="location.href='wills.html'"><span class="footer-list-symbol">»</span> Wills and Estates</li>
                        <li onclick="location.href='childCustody.html'"><span class="footer-list-symbol">»</span> Parenting & Custody</li>
                        <li onclick="location.href='spousalSupport.html'"><span class="footer-list-symbol">»</span> Spousal & Partner Support</li>
                        <li onclick="location.href='childWelfare.html'"><span class="footer-list-symbol">»</span> Child Welfare</li>
                    </ul>
                </div>
                <div class="col-md-3">
                    <h3 class="theme-color">Location</h3>
                    <p>Suite 203</p>
                    <p>3016 19 Street NE</p>
                    <p>Calgary, AB, Canada</p>
                    <p>T2E 6Y9</p>
                </div>
                <div class="col-md-3">
                    <h3 class="theme-color">Hours</h3>
                    <p>Monday: 8:00 am – 5:00 pm</p>
                    <p>Tuesday: 8:00 am – 5:00 pm</p>
                    <p>Wednesday: 8:00 am – 5:00 pm</p>
                    <p>Thursday: 8:00 am – 5:00 pm</p>
                    <p>Friday: 8:00 am – 5:00 pm</p>
                    <p>Saturday & Sunday: By appointment only</p>
                </div>
            </div>
        </div>
        <div class="copyright">
            ©Website designed by <strong><span>Ali Al-Khaz'Aly</span></strong>. All Rights Reserved
        </div>
    </footer>
        `
    }
}

class customHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = ` 
        <header class="header" style="background-color: #e3f2fd;">
    <nav class="navbar navbar-expand-lg navbar-light" >
        <div class="container">
            <div class="flex-grow-1"><a class="navbar-brand monteserrat" href="index.html" style="font-size:3em">AAMEH LAW FIRM</a> </div>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav"
                    aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ml-auto flex-grow-1 justify-content-evenly">
                    <li class="nav-item">
                        <a class="nav-link" href="index.html">Home</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="ourTeam.html">Our Team</a>
                    </li>
                    <li class="nav-item">
                        <div class="dropdown">
                            <a class="nav-link" onmouseover="displayDropdown()" href="#">Services & Practice Areas</a>
                            <div class="dropdown-content" id="myDropdown">
                                <a href="divorceSeparation.html">Divorce and Separation</a>
                                <a href="immigration.html">Immigration Law</a>
                                <a href="criminalMatters.html">Criminal Matters</a>
                                <a href="realEstate.html">Real Estate Law</a>
                                <a href="wills.html">Wills and Estates</a>
                                <a href="childCustody.html">Parenting & Custody</a>
                                <a href="spousalSupport.html">Spousal and Partner Support</a>
                                <a href="childWelfare.html">Child Welfare</a>
                            </div>
                        </div>
<!--                    <li class="nav-item">-->
<!--                        <a class="nav-link" href="blog.html">Blog and Knowledge</a>-->
<!--                    </li>-->
                    <li class="nav-item">
                        <a class="nav-link" href="contact.html">Contact</a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>
</header>
        `
    }
}
window.customElements.define('app-footer', customFooter)
window.customElements.define('app-header', customHeader)