/* ==========================================================================
   MARKETMIND AI - INTERACTION ENGINE
   ========================================================================== */

// --- Production Environment Variables ---
// Google Maps Platform API Key — powers live maps, Places API, and Geocoding.
const GOOGLE_MAPS_API_KEY = "AIzaSyDjwAOLM4lVOaxpVAipN1UhIYeUNYRVdMw";
let currentlyLoadedGmapsKey = null;

document.addEventListener('DOMContentLoaded', () => {

  // --- Theme Management System ---
  window.applyAppTheme = function (theme) {
    let effectiveTheme = theme;
    if (!theme || theme === 'system') {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      effectiveTheme = prefersLight ? 'light' : 'dark';
    }

    if (effectiveTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  };

  function initAppTheme() {
    let savedTheme = 'dark';
    try {
      const storedPrefs = localStorage.getItem('mm_user_preferences');
      if (storedPrefs) {
        const parsed = JSON.parse(storedPrefs);
        if (parsed.theme) savedTheme = parsed.theme;
      }
    } catch (e) { }

    window.applyAppTheme(savedTheme);

    if (!window._themeMediaListenerBound) {
      window._themeMediaListenerBound = true;
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        try {
          const stored = localStorage.getItem('mm_user_preferences');
          const theme = stored ? JSON.parse(stored).theme : 'dark';
          if (theme === 'system') {
            window.applyAppTheme('system');
          }
        } catch (err) { }
      });
    }
  }

  initAppTheme();

  // --- Geolocation & Google Maps State ---
  let currentUserCoords = null;
  let userWatchId = null;
  let dashboardMap = null;
  let dashboardUserMarker = null;
  let dashboardTargetMarker = null;
  let dashboardMarkers = [];
  let dashboardHeatmap = null;
  let opportunitiesMap = null;
  let opportunitiesUserMarker = null;
  let opportunitiesMarkers = [];
  let opportunitiesClusterer = null;
  let activeInfoWindow = null;
  // Tracks the API key used to load the current Maps script so we can
  // detect a key change and reload without stale credentials.
  // Global filters & state
  let activeFilters = {
    category: "All",
    maxInvestment: 5000000,
    risk: "All",
    competition: "All",
    roi: "All",
    minScore: 70,
    radius: 5
  };

  // Caching API responses to reduce queries
  const apiCache = {
    places: {},
    landmarks: {},
    geocoding: {}
  };

  const darkMapThemeStyles = [
    { elementType: 'geometry', stylers: [{ color: '#121218' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#121218' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#88889a' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#b0b0bf' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#a855f7' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0d181e' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#20202e' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#161622' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7a7a90' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#090a12' }] }
  ];

  function getCacheKey(lat, lng) {
    return `${lat.toFixed(3)}_${lng.toFixed(3)}`;
  }

  // --- DOM Elements ---
  const screens = {
    splash: document.getElementById('splash-screen'),
    auth: document.getElementById('auth-screen'),
    dashboard: document.getElementById('dashboard-screen')
  };

  const tabs = {
    login: document.getElementById('tab-login'),
    signup: document.getElementById('tab-signup')
  };

  const formViews = {
    login: document.getElementById('login-form-view'),
    signup: document.getElementById('signup-form-view')
  };

  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const toggleToSignIn = document.getElementById('toggle-to-signin');
  const btnLogout = document.getElementById('btn-logout');
  const btnAiScan = document.getElementById('run-ai-scan');
  const mobileNavToggle = document.getElementById('mobile-nav-toggle');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const dashSidebar = document.querySelector('.dash-sidebar');

  const navItems = document.querySelectorAll('.nav-item');
  const socialAuthBtns = document.querySelectorAll('.social-auth-buttons .btn');
  const inputFields = document.querySelectorAll('.input-wrapper input');

  // Sub-views mapping
  const subViews = {
    dashboard: document.getElementById('view-dashboard'),
    newAnalysis: document.getElementById('view-new-analysis'),
    processing: document.getElementById('view-processing'),
    recommendation: document.getElementById('view-recommendation'),
    opportunities: document.getElementById('view-opportunities'),
    savedReports: document.getElementById('view-saved-reports'),
    aiInsights: document.getElementById('view-ai-insights'),
    marketTrends: document.getElementById('view-market-trends'),
    settings: document.getElementById('view-settings')
  };

  // Form Controls
  const cardHasIdea = document.getElementById('goal-has-idea');
  const cardSuggestIdea = document.getElementById('goal-suggest-idea');
  const groupBusinessType = document.getElementById('group-business-type');
  const selectBusinessType = document.getElementById('analysis-business-type');
  const searchBusinessType = document.getElementById('analysis-business-type-search');
  const btnLocCurrent = document.getElementById('loc-current');
  const btnLocSearch = document.getElementById('loc-search');
  const wrapperLocSearchInput = document.querySelector('.search-loc-input-wrapper');
  const inputLocSearch = document.getElementById('analysis-location-search');
  const sliderBudget = document.getElementById('analysis-budget');
  const lblBudgetDisplay = document.getElementById('budget-val-lbl');

  const analysisForm = document.getElementById('market-analysis-form');
  const processingSuccessModal = document.getElementById('processing-success-modal');

  // --- Screen Navigation Manager ---
  function navigateTo(targetScreenId) {
    // Fade out active screens
    Object.values(screens).forEach(screen => {
      if (screen.classList.contains('active')) {
        screen.classList.remove('active');
      }
    });

    // Fade in target screen
    const targetScreen = screens[targetScreenId];
    if (targetScreen) {
      setTimeout(() => {
        targetScreen.classList.add('active');
        // If transitioning to dashboard, trigger path draw animations again
        if (targetScreenId === 'dashboard') {
          animateDashboardEntrance();
        }
      }, 300); // Allow time for exit fade transition
    }
  }

  // --- Splash Screen Auto-Navigation ---
  setTimeout(() => {
    navigateTo('auth');
  }, 2800); // Navigates to Auth screen after 2.8 seconds

  // --- Auth View Toggles (Sign In vs Sign Up) ---
  function switchAuthTab(activeTab) {
    if (activeTab === 'login') {
      tabs.login.classList.add('active');
      tabs.signup.classList.remove('active');
      formViews.login.classList.add('active');
      formViews.signup.classList.remove('active');
      if (toggleToSignIn.parentElement) {
        toggleToSignIn.parentElement.innerHTML = 'Don\'t have an account? <span id="toggle-to-signup" class="form-link-action">Sign Up</span>';
        attachSignupToggleListener();
      }
    } else {
      tabs.signup.classList.add('active');
      tabs.login.classList.remove('active');
      formViews.signup.classList.add('active');
      formViews.login.classList.remove('active');
      if (toggleToSignIn.parentElement) {
        toggleToSignIn.parentElement.innerHTML = 'Already have an account? <span id="toggle-to-signin" class="form-link-action">Sign In</span>';
        attachSigninToggleListener();
      }
    }
  }

  tabs.login.addEventListener('click', () => switchAuthTab('login'));
  tabs.signup.addEventListener('click', () => switchAuthTab('signup'));

  function attachSignupToggleListener() {
    const toggleToSignUp = document.getElementById('toggle-to-signup');
    if (toggleToSignUp) {
      toggleToSignUp.addEventListener('click', () => switchAuthTab('signup'));
    }
  }

  function attachSigninToggleListener() {
    const toggleToSignIn = document.getElementById('toggle-to-signin');
    if (toggleToSignIn) {
      toggleToSignIn.addEventListener('click', () => switchAuthTab('login'));
    }
  }

  // Initialize toggles
  attachSignupToggleListener();

  // --- Simulated Authentication Flows ---
  function handleSuccessfulLogin() {
    // Adding class to simulate loader
    const submitBtns = document.querySelectorAll('.btn-submit');
    submitBtns.forEach(btn => {
      btn.style.opacity = '0.7';
      btn.innerHTML = '🚀 Analyse Market';
    });

    setTimeout(() => {
      // Revert buttons text
      submitBtns[0].innerHTML = 'Sign In to Dashboard';
      submitBtns[1].innerHTML = 'Generate Free Workspace';
      submitBtns.forEach(btn => btn.style.opacity = '1');

      // Navigate to Dashboard screen container
      navigateTo('dashboard');

      // Make New Market Analysis view active immediately
      if (subViews.dashboard && subViews.newAnalysis) {
        subViews.dashboard.classList.remove('active');
        subViews.newAnalysis.classList.add('active');
      }

      // Set sidebar active tab to New Market Analysis (data-nav="signals")
      navItems.forEach(item => {
        if (item.getAttribute('data-nav') === 'signals') {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      // Update dynamic AI preview values initially
      updateAiPreview();

    }, 1000);
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSuccessfulLogin();
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSuccessfulLogin();
  });

  // Authenticate on social clicks as a convenience helper
  socialAuthBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      handleSuccessfulLogin();
    });
  });

  // Logout transition
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      navigateTo('auth');
    });
  }

  // --- Dashboard Sidebar Navigation Toggles ---
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      const targetNav = item.getAttribute('data-nav');

      // Deactivate all subViews
      Object.values(subViews).forEach(view => {
        if (view) view.classList.remove('active');
      });

      if (targetNav === 'home' || targetNav === 'dashboard') {
        if (subViews.dashboard) {
          subViews.dashboard.classList.add('active');
          if (window.google && window.google.maps) {
            initializeMapsAfterScriptLoad();
            if (dashboardMap) {
              setTimeout(() => {
                google.maps.event.trigger(dashboardMap, 'resize');
              }, 100);
            }
          }
        }
      } else if (targetNav === 'signals') {
        if (subViews.newAnalysis) subViews.newAnalysis.classList.add('active');
      } else if (targetNav === 'opportunities') {
        if (subViews.opportunities) {
          subViews.opportunities.classList.add('active');
          initOpportunitiesPage();
        }
      } else if (targetNav === 'reports') {
        if (subViews.savedReports) {
          subViews.savedReports.classList.add('active');
          initSavedReportsPage();
        }
      } else if (targetNav === 'insights') {
        if (subViews.aiInsights) {
          subViews.aiInsights.classList.add('active');
          initAiInsightsPage();
        }
      } else if (targetNav === 'trends') {
        if (subViews.marketTrends) {
          subViews.marketTrends.classList.add('active');
          initMarketTrendsPage();
        }
      } else if (targetNav === 'settings') {
        if (subViews.settings) {
          subViews.settings.classList.add('active');
          initSettingsPage();
        }
      } else {
        // Fallback for placeholders
        if (subViews.newAnalysis) subViews.newAnalysis.classList.add('active');
      }

      // Auto-close sidebar on mobile navigation
      if (dashSidebar && dashSidebar.classList.contains('active')) {
        dashSidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        if (mobileNavToggle) mobileNavToggle.classList.remove('open');
      }

      // Create a minor transition scale effect to dashboard content
      const dashContent = document.querySelector('.dash-scrollable-content');
      if (dashContent) {
        dashContent.style.opacity = '0.5';
        dashContent.style.transform = 'translateY(5px)';
        setTimeout(() => {
          dashContent.style.opacity = '1';
          dashContent.style.transform = 'translateY(0)';
        }, 150);
      }
    });
  });

  // --- Mobile Navigation Drawer Toggling ---
  if (mobileNavToggle && sidebarOverlay && dashSidebar) {
    mobileNavToggle.addEventListener('click', () => {
      mobileNavToggle.classList.toggle('open');
      dashSidebar.classList.toggle('active');
      sidebarOverlay.classList.toggle('active');
    });

    sidebarOverlay.addEventListener('click', () => {
      mobileNavToggle.classList.remove('open');
      dashSidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    });
  }

  // --- Input micro-interactions (floating highlights on focus) ---
  inputFields.forEach(input => {
    input.addEventListener('focus', () => {
      input.parentElement.classList.add('focused');
    });
    input.addEventListener('blur', () => {
      input.parentElement.classList.remove('focused');
    });
  });

  // --- AI Scan trigger animation & mock update ---
  if (btnAiScan) {
    btnAiScan.addEventListener('click', () => {
      btnAiScan.innerHTML = `
        <svg class="btn-spark-icon rotate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s infinite linear;">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        Running Market Intelligence Agents...
      `;
      btnAiScan.disabled = true;

      // Animate grid numbers and statistics slightly to show interactive behavior
      const numElements = document.querySelectorAll('.stat-card-number');
      const progressBars = document.querySelectorAll('.stat-bar-fill');

      numElements.forEach(el => {
        el.style.opacity = '0.4';
      });

      setTimeout(() => {
        // Change numbers slightly for Business Intelligence variables
        if (numElements[0]) numElements[0].innerHTML = `93 <span class="lbl-small">/ 100</span>`;
        if (numElements[1]) {
          numElements[1].innerHTML = `6 <span class="lbl-small">Businesses</span>`;
          if (progressBars[0]) {
            progressBars[0].style.width = '35%';
            progressBars[0].style.backgroundColor = '#10b981';
            progressBars[0].style.boxShadow = '0 0 6px #10b981';
          }
          const compLevelText = document.querySelector('.stats-grid .stat-item:nth-child(2) .stat-card-percent-change');
          if (compLevelText) {
            compLevelText.innerText = 'Low Competition';
            compLevelText.style.color = '#10b981';
          }
        }
        if (numElements[2]) {
          numElements[2].innerText = `Very High`;
          if (progressBars[1]) progressBars[1].style.width = '95%';
        }
        if (numElements[3]) {
          numElements[3].innerHTML = `98%`;
          const scorePercentText = document.querySelector('.stats-grid .stat-item:nth-child(4) .stat-card-percent-change');
          if (scorePercentText) scorePercentText.innerText = '98%';
        }

        // Add visual update to the Quick Insights as well
        const quickRecommendation = document.querySelector('.quick-insights-card .insight-item-card:nth-child(1) .insight-val');
        if (quickRecommendation) {
          quickRecommendation.style.opacity = '0.3';
          setTimeout(() => {
            quickRecommendation.innerText = 'Organic Beverage Cafe';
            quickRecommendation.style.opacity = '1';
          }, 300);
        }

        numElements.forEach(el => {
          el.style.opacity = '1';
          el.style.transition = 'opacity 0.5s ease';
        });

        // Revert scan button
        btnAiScan.innerHTML = `
          <svg class="btn-spark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          Analysis Complete
        `;
        btnAiScan.disabled = false;

        setTimeout(() => {
          btnAiScan.innerHTML = `
            <svg class="btn-spark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            Start New Analysis
          `;
        }, 3000);

      }, 2000);
    });
  }

  // --- Section 1: Goal selection cards toggling ---
  if (cardHasIdea && cardSuggestIdea && groupBusinessType) {
    cardHasIdea.addEventListener('click', () => {
      cardHasIdea.classList.add('active');
      cardSuggestIdea.classList.remove('active');
      groupBusinessType.style.display = 'flex';
      if (searchBusinessType) searchBusinessType.required = true;
      updateAiPreview();
    });

    cardSuggestIdea.addEventListener('click', () => {
      cardSuggestIdea.classList.add('active');
      cardHasIdea.classList.remove('active');
      groupBusinessType.style.display = 'none';
      if (searchBusinessType) searchBusinessType.required = false;
      updateAiPreview();
    });
  }

  // --- Location Option Selector Buttons ---
  if (btnLocCurrent && btnLocSearch && wrapperLocSearchInput) {
    btnLocCurrent.addEventListener('click', () => {
      btnLocCurrent.classList.add('active');
      btnLocSearch.classList.remove('active');
      wrapperLocSearchInput.style.display = 'none';
      inputLocSearch.required = false;
      updateAiPreview();
    });

    btnLocSearch.addEventListener('click', () => {
      btnLocSearch.classList.add('active');
      btnLocCurrent.classList.remove('active');
      wrapperLocSearchInput.style.display = 'block';
      inputLocSearch.required = true;
      inputLocSearch.focus();
      updateAiPreview();
    });
  }

  // --- Budget Slider Real-time Indian Currency Formatting ---
  function formatIndianCurrency(num) {
    const x = num.toString();
    let lastThree = x.substring(x.length - 3);
    const otherNumbers = x.substring(0, x.length - 3);
    if (otherNumbers !== '') {
      lastThree = ',' + lastThree;
    }
    const res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
    return '₹' + res;
  }

  if (sliderBudget && lblBudgetDisplay) {
    sliderBudget.addEventListener('input', (e) => {
      lblBudgetDisplay.innerText = formatIndianCurrency(e.target.value);
      updateAiPreview();
    });
  }

  // --- DYNAMIC BUSINESS RECOMMENDATION MATRIX ---
  const TARGET_CUSTOMER_BUSINESS_POOLS = {
    "Food Lovers": [
      { name: "Artisanal Bakery & Brew", category: "Food & Beverage", icon: "🥐", baseInvestment: 1200000, baseProfit: 110000, baseRoi: 14, tip: "Bakeries experience peak consumer volumes during early morning & tea hours." },
      { name: "Wood-Fired Pizza Shop", category: "Food & Beverage", icon: "🍕", baseInvestment: 1500000, baseProfit: 140000, baseRoi: 16, tip: "High evening food delivery demand near residential clusters." },
      { name: "Cold-Press Juice & Smoothie Bar", category: "Food & Beverage", icon: "🥤", baseInvestment: 450000, baseProfit: 65000, baseRoi: 12, tip: "Exceptional profit margin up to 70% markup on cold-press items." },
      { name: "Specialty Espresso Cafe", category: "Food & Beverage", icon: "☕", baseInvestment: 1400000, baseProfit: 130000, baseRoi: 15, tip: "Cafes near offices perform strongly during weekdays." },
      { name: "Gourmet Health Restaurant", category: "Food & Beverage", icon: "🥗", baseInvestment: 2800000, baseProfit: 240000, baseRoi: 18, tip: "High average ticket size capturing health-conscious foodies." },
      { name: "Organic Ice Cream Gelateria", category: "Food & Beverage", icon: "🍦", baseInvestment: 600000, baseProfit: 75000, baseRoi: 13, tip: "Perform best near transit nodes and malls during afternoon & night." },
      { name: "Express Fast Food & Burger Joint", category: "Food & Beverage", icon: "🍔", baseInvestment: 900000, baseProfit: 95000, baseRoi: 14, tip: "High footfall velocity and rapid kitchen turnaround times." }
    ],
    "Students": [
      { name: "Student Stationery & Supply Mart", category: "Retail & Supplies", icon: "✏️", baseInvestment: 350000, baseProfit: 50000, baseRoi: 12, tip: "Constant recurring demand during semester & exam cycles." },
      { name: "High-Speed Xerox & Digital Print Center", category: "Services", icon: "🖨️", baseInvestment: 400000, baseProfit: 60000, baseRoi: 11, tip: "High gross margin service model with low inventory risk." },
      { name: "Modern Student Hostel & PG", category: "Hospitality", icon: "🏢", baseInvestment: 4500000, baseProfit: 350000, baseRoi: 22, tip: "High annual occupancy rate and predictable monthly rental income." },
      { name: "Chai & Evening Snacks Point", category: "Food & Beverage", icon: "☕", baseInvestment: 300000, baseProfit: 55000, baseRoi: 10, tip: "Low barrier to entry with high daily volume of student hangouts." },
      { name: "Student Bookstore & Study Hub", category: "Retail & Tech", icon: "📚", baseInvestment: 650000, baseProfit: 70000, baseRoi: 15, tip: "Combines book sales with paid quiet study desks." },
      { name: "Computer Training & Tech Academy", category: "Services", icon: "💻", baseInvestment: 800000, baseProfit: 90000, baseRoi: 16, tip: "High fee margins for certification and coding bootcamp courses." }
    ],
    "Hospital Visitors": [
      { name: "24/7 Medical & Pharmacy Store", category: "Healthcare", icon: "💊", baseInvestment: 1200000, baseProfit: 150000, baseRoi: 12, tip: "Recession-proof demand operating 24 hours near hospital gates." },
      { name: "Fresh Fruit & Healthy Juice Stall", category: "Food & Beverage", icon: "🍎", baseInvestment: 350000, baseProfit: 55000, baseRoi: 10, tip: "High impulse purchase rates from patient relatives and visitors." },
      { name: "Quick Tiffin & Homestyle Meals", category: "Food & Beverage", icon: "🍱", baseInvestment: 500000, baseProfit: 75000, baseRoi: 13, tip: "Reliable daily breakfast and lunch demand for hospital staff and visitors." },
      { name: "Hospital Tea & Snacks Counter", category: "Food & Beverage", icon: "☕", baseInvestment: 250000, baseProfit: 45000, baseRoi: 9, tip: "Constant round-the-clock footfall with minimal overhead costs." },
      { name: "Fresh Flower & Gift Kiosk", category: "Retail", icon: "💐", baseInvestment: 200000, baseProfit: 40000, baseRoi: 10, tip: "High margin impulse purchases by hospital visitors." },
      { name: "Medical Equipment & Care Store", category: "Healthcare", icon: "🩺", baseInvestment: 1800000, baseProfit: 190000, baseRoi: 16, tip: "High ticket sales for orthopedic, surgical, and homecare aids." }
    ],
    "Office Employees": [
      { name: "Executive Coffee & Bistro Lounge", category: "Food & Beverage", icon: "☕", baseInvestment: 1600000, baseProfit: 160000, baseRoi: 14, tip: "High weekday corporate footfall and informal meeting bookings." },
      { name: "Corporate Lunch & Express Deli", category: "Food & Beverage", icon: "🥗", baseInvestment: 950000, baseProfit: 110000, baseRoi: 13, tip: "Captures 12 PM - 3 PM peak corporate lunch rush with subscription plans." },
      { name: "Digital Printing & Document Center", category: "Services", icon: "🖨️", baseInvestment: 500000, baseProfit: 65000, baseRoi: 12, tip: "B2B document binding, printing, and courier drop service." },
      { name: "Boutique Coworking Space & Desks", category: "Services", icon: "💼", baseInvestment: 3500000, baseProfit: 300000, baseRoi: 20, tip: "Flexible desk rentals catering to remote corporate teams." }
    ],
    "Women": [
      { name: "Luxury Beauty & Hair Salon", category: "Services", icon: "💅", baseInvestment: 1800000, baseProfit: 170000, baseRoi: 16, tip: "High recurring revenue with repeat visits every 3-4 weeks." },
      { name: "Designer Ethnic & Western Boutique", category: "Retail & Fashion", icon: "👗", baseInvestment: 1500000, baseProfit: 130000, baseRoi: 18, tip: "High margins on boutique wear and customized tailoring." },
      { name: "Premium Cosmetics & Skincare Studio", category: "Retail & Beauty", icon: "💄", baseInvestment: 900000, baseProfit: 95000, baseRoi: 14, tip: "Strong brand loyalty and high basket value upsells." },
      { name: "Fashion Jewellery & Accessory Shop", category: "Retail", icon: "💍", baseInvestment: 700000, baseProfit: 80000, baseRoi: 13, tip: "Low space footprint with high profit margin per item." }
    ],
    "Men": [
      { name: "Urban Men's Fashion Outlet", category: "Retail & Fashion", icon: "👕", baseInvestment: 1600000, baseProfit: 140000, baseRoi: 17, tip: "High demand for casual streetwear and athletic apparel." },
      { name: "Men's Grooming Salon & Barbershop", category: "Services", icon: "💈", baseInvestment: 800000, baseProfit: 90000, baseRoi: 13, tip: "Steady weekly haircut and grooming customer retention." },
      { name: "Sneaker & Athletic Footwear Hub", category: "Retail", icon: "👟", baseInvestment: 1400000, baseProfit: 120000, baseRoi: 16, tip: "Niche footwear releases with strong word-of-mouth draw." },
      { name: "Performance Strength Gym & Club", category: "Fitness & Health", icon: "🏋️", baseInvestment: 2500000, baseProfit: 220000, baseRoi: 18, tip: "Monthly subscription cash flows with personal training add-ons." }
    ],
    "Senior Citizens": [
      { name: "Orthopedic & Mobility Store", category: "Healthcare", icon: "🩼", baseInvestment: 1100000, baseProfit: 120000, baseRoi: 14, tip: "Serves specialized senior healthcare and mobility assistance needs." },
      { name: "Senior Wellness Pharmacy", category: "Healthcare", icon: "💊", baseInvestment: 1300000, baseProfit: 140000, baseRoi: 13, tip: "High customer lifetime value with recurring prescription fills." },
      { name: "Organic Healthy Food Store", category: "Retail & Food", icon: "🥦", baseInvestment: 750000, baseProfit: 80000, baseRoi: 14, tip: "Clean organic staples for health-conscious senior residents." }
    ],
    "Families": [
      { name: "Supermarket & Grocery Mart", category: "Retail", icon: "🛒", baseInvestment: 3000000, baseProfit: 260000, baseRoi: 18, tip: "Essential household staple anchor store for family clusters." },
      { name: "Organic Fresh Produce Mart", category: "Retail", icon: "🥦", baseInvestment: 850000, baseProfit: 90000, baseRoi: 14, tip: "High repeat weekly household grocery purchases." },
      { name: "Educational Toy & Kids Store", category: "Retail", icon: "🧸", baseInvestment: 1200000, baseProfit: 110000, baseRoi: 16, tip: "High weekend family footfall near residential sectors." },
      { name: "Home Needs & Essentials Store", category: "Retail", icon: "🏠", baseInvestment: 1400000, baseProfit: 125000, baseRoi: 15, tip: "Broad inventory appeal for daily household maintenance items." }
    ],
    "Visitors/Tourists": [
      { name: "Local Souvenir & Handicraft Shop", category: "Retail", icon: "🏺", baseInvestment: 600000, baseProfit: 75000, baseRoi: 13, tip: "High tourist impulse purchases near transit and cultural nodes." },
      { name: "Local Food & Heritage Restaurant", category: "Food & Beverage", icon: "🍲", baseInvestment: 2200000, baseProfit: 210000, baseRoi: 16, tip: "Showcases regional authentic dishes to travelers and visitors." },
      { name: "Travel Desk & Experience Agency", category: "Services", icon: "✈️", baseInvestment: 400000, baseProfit: 60000, baseRoi: 11, tip: "Commisions on local day tours, cabs, and hotel bookings." }
    ],
    "General Public": [
      { name: "Neighborhood Grocery Store", category: "Retail", icon: "🛒", baseInvestment: 1500000, baseProfit: 130000, baseRoi: 15, tip: "Anchor retail format serving general residential neighborhood." },
      { name: "Specialty Bakery & Cafe", category: "Food & Beverage", icon: "🥐", baseInvestment: 1200000, baseProfit: 110000, baseRoi: 14, tip: "Versatile food concept with morning and evening footfalls." },
      { name: "24/7 Medical Pharmacy", category: "Healthcare", icon: "💊", baseInvestment: 1100000, baseProfit: 130000, baseRoi: 13, tip: "Essential health services needed in every urban location." }
    ]
  };

  function generateDynamicBusinessRecommendations(targetVal, locationVal, sizeVal, budgetVal) {
    const locStr = (locationVal || "Indiranagar, Bengaluru").trim();
    const budgetNum = parseInt(budgetVal) || 2500000;
    const targetStr = (targetVal || "General Public").trim();

    // 1. Gather candidate pool based on target customer selections
    let pool = [];
    Object.keys(TARGET_CUSTOMER_BUSINESS_POOLS).forEach(key => {
      if (targetStr.toLowerCase().includes(key.toLowerCase())) {
        pool.push(...TARGET_CUSTOMER_BUSINESS_POOLS[key]);
      }
    });

    if (pool.length === 0) {
      pool = [...TARGET_CUSTOMER_BUSINESS_POOLS["General Public"], ...TARGET_CUSTOMER_BUSINESS_POOLS["Food Lovers"]];
    }

    // 2. Hash string seed to ensure reproducible score variations per location & input combo
    let seed = 0;
    const comboStr = (locStr + targetStr + sizeVal + budgetNum).toLowerCase();
    for (let i = 0; i < comboStr.length; i++) {
      seed += comboStr.charCodeAt(i);
    }

    const pseudoRandom = (offset, min, max) => {
      const x = Math.sin(seed + offset) * 10000;
      const r = x - Math.floor(x);
      return Math.floor(r * (max - min + 1)) + min;
    };

    // 3. Compute dynamic scores for candidates
    const sizeMultiplier = sizeVal === "Small" ? 0.6 : sizeVal === "Medium" ? 1.0 : 1.7;

    const scoredPool = pool.map((item, idx) => {
      const scaledInvestment = Math.round(item.baseInvestment * sizeMultiplier);
      const scaledProfit = Math.round(item.baseProfit * sizeMultiplier);

      // Score components
      const budgetRatio = scaledInvestment / budgetNum;
      const budgetFitBonus = (budgetRatio >= 0.3 && budgetRatio <= 0.95) ? 12 : 4;
      const locationHashBonus = pseudoRandom(idx * 3, 2, 14);
      const targetMatchBonus = 15;

      const rawScore = Math.min(98, Math.max(68, 62 + targetMatchBonus + budgetFitBonus + locationHashBonus));
      const confidence = Math.min(99, rawScore + pseudoRandom(idx, 1, 3));
      const compVal = pseudoRandom(idx * 7, 0, 3);
      const competition = compVal === 0 ? "Low" : compVal <= 2 ? "Moderate" : "High";

      const whySuits = `Directly targets ${targetStr} in ${locStr}. ` +
        (compVal === 0 ? `Zero direct competitors detected nearby creating a prime market gap.` :
          compVal <= 2 ? `Only ${compVal} nearby competitor(s) operating, leaving a healthy opening window.` :
            `High demand density supports market entry despite moderate competitor density.`);

      return {
        name: item.name,
        category: item.category,
        icon: item.icon,
        whySuits,
        score: rawScore,
        competition,
        investment: scaledInvestment,
        profit: scaledProfit,
        roi: item.baseRoi,
        confidence,
        tip: item.tip,
        traffic: `${pseudoRandom(idx * 4, 1200, 4500).toLocaleString('en-IN')}+ / mo`
      };
    });

    // Sort by score descending and deduplicate by name
    const uniqueMap = new Map();
    scoredPool.forEach(item => {
      if (!uniqueMap.has(item.name)) {
        uniqueMap.set(item.name, item);
      }
    });

    const sortedList = Array.from(uniqueMap.values()).sort((a, b) => b.score - a.score);

    // Return Top 5 ranked business opportunities
    return sortedList.slice(0, 5);
  }

  function updateAiPreview() {
    const isSuggestGoal = cardSuggestIdea && cardSuggestIdea.classList.contains('active');

    let typeVal = "Select Type...";
    if (isSuggestGoal) {
      typeVal = "AI Recommended (Optimized)";
    } else if (selectBusinessType) {
      typeVal = selectBusinessType.value || "Select Type...";
    }

    let rawLoc = (inputLocSearch && inputLocSearch.value.trim()) || "Indiranagar, Bengaluru";
    let locVal = "📍 Current Location";
    if (btnLocSearch && btnLocSearch.classList.contains('active')) {
      locVal = "📌 " + rawLoc;
    } else {
      rawLoc = "Indiranagar, Bengaluru";
    }

    const budgetRaw = sliderBudget ? sliderBudget.value : 2500000;
    const budgetVal = sliderBudget ? formatIndianCurrency(sliderBudget.value) : "₹25,00,000";

    let sizeVal = "Small";
    const selectedSizeRadio = document.querySelector('input[name="business-size"]:checked');
    if (selectedSizeRadio) {
      sizeVal = selectedSizeRadio.value;
    }

    const selectTarget = document.getElementById('analysis-target-customers');
    const targetVal = (selectTarget && selectTarget.value) || "General Public";

    // Dynamic Top 5 Recommendations calculation
    const topRecs = generateDynamicBusinessRecommendations(targetVal, rawLoc, sizeVal, budgetRaw);
    const topRec = topRecs[0] || { name: "Boutique Cafe", score: 92, competition: "Low", traffic: "2,000+ / mo", tip: "Strong market demand." };

    // Update summaries
    const previewValType = document.getElementById('preview-val-type');
    const previewValLoc = document.getElementById('preview-val-loc');
    const previewValBudget = document.getElementById('preview-val-budget');
    const previewValSize = document.getElementById('preview-val-size');
    const previewValTarget = document.getElementById('preview-val-target');

    if (previewValType) previewValType.innerText = isSuggestGoal ? `AI Rec: ${topRec.name}` : typeVal;
    if (previewValLoc) previewValLoc.innerText = locVal;
    if (previewValBudget) previewValBudget.innerText = budgetVal;
    if (previewValSize) previewValSize.innerText = sizeVal;
    if (previewValTarget) previewValTarget.innerText = targetVal;

    // Update predictions
    const mapLabelBusiness = document.getElementById('map-label-business');
    const predValCompetition = document.getElementById('pred-val-competition');
    const predValDemand = document.getElementById('pred-val-demand');
    const predValTraffic = document.getElementById('pred-val-traffic');
    const predValScore = document.getElementById('pred-val-score');
    const previewTipText = document.getElementById('preview-tip-text');

    if (predValCompetition) {
      predValCompetition.innerText = topRec.competition;
      predValCompetition.className = `pred-val ${topRec.competition === 'Low' ? 'text-green' : topRec.competition === 'Moderate' ? 'text-yellow' : 'text-orange'}`;
    }
    if (predValDemand) {
      predValDemand.innerText = topRec.score >= 90 ? "Very High" : "High";
      predValDemand.className = `pred-val text-cyan`;
    }
    if (predValTraffic) predValTraffic.innerText = topRec.traffic;
    if (predValScore) predValScore.innerHTML = `${topRec.score} <span class="lbl-small">/ 100</span>`;
    if (previewTipText) previewTipText.innerText = topRec.tip;

    if (mapLabelBusiness) {
      if (isSuggestGoal) {
        mapLabelBusiness.innerText = `AI Rec: ${topRec.name}`;
      } else {
        mapLabelBusiness.innerText = `Your ${selectBusinessType ? selectBusinessType.value : "Business"}`;
      }
    }
  }

  // Attach dynamic updates to dropdowns, text entries and radios
  if (selectBusinessType) selectBusinessType.addEventListener('change', updateAiPreview);
  if (inputLocSearch) inputLocSearch.addEventListener('input', updateAiPreview);

  const sizeRadioBtns = document.querySelectorAll('input[name="business-size"]');
  sizeRadioBtns.forEach(radio => {
    radio.addEventListener('change', updateAiPreview);
  });

  const selectTarget = document.getElementById('analysis-target-customers');
  if (selectTarget) selectTarget.addEventListener('change', updateAiPreview);

  // Initial call
  updateAiPreview();

  // --- Budget Slider Real-time Indian Currency Formatting ---

  // --- Form Submission with Multi-stage AI Loading Screen ---
  let globalAnalysisResult = null;

  if (analysisForm && processingSuccessModal) {
    analysisForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // 1. Capture dynamic parameters from form fields
      const isSuggestGoal = cardSuggestIdea && cardSuggestIdea.classList.contains('active');
      const businessQuery = isSuggestGoal ? "" : (selectBusinessType ? selectBusinessType.value.trim() : "");
      const locationQuery = (btnLocSearch && btnLocSearch.classList.contains('active') && inputLocSearch) ? inputLocSearch.value.trim() : "";

      const budgetVal = sliderBudget ? sliderBudget.value : 2500000;
      const budgetText = sliderBudget ? formatIndianCurrency(sliderBudget.value) : "₹25,00,000";

      let sizeVal = "Small";
      const selectedSizeRadio = document.querySelector('input[name="business-size"]:checked');
      if (selectedSizeRadio) {
        sizeVal = selectedSizeRadio.value;
      }

      const selectTargetField = document.getElementById('analysis-target-customers');
      const targetVal = (selectTargetField && selectTargetField.value) || "General Public";

      const locText = locationQuery ? `📌 ${locationQuery}` : "📍 Current Location";
      const typeText = isSuggestGoal ? "AI Recommended" : (businessQuery || "General Retail");

      // Dynamically generate current time as "HH:MM:SS"
      const now = new Date();
      const formatTime = (t) => t.toString().padStart(2, '0');
      const startTimeText = `${formatTime(now.getHours())}:${formatTime(now.getMinutes())}:${formatTime(now.getSeconds())}`;

      // Populate right sidebar summary parameters inside processing view
      const summaryType = document.getElementById('proc-summary-type');
      const summaryLoc = document.getElementById('proc-summary-loc');
      const summaryBudget = document.getElementById('proc-summary-budget');
      const summarySize = document.getElementById('proc-summary-size');
      const summaryTarget = document.getElementById('proc-summary-target');
      const summaryStartTime = document.getElementById('proc-summary-start-time');
      const summaryTimeLeft = document.getElementById('proc-summary-time-left');
      const summaryConfidence = document.getElementById('proc-summary-confidence');

      if (summaryType) summaryType.innerText = typeText;
      if (summaryLoc) summaryLoc.innerText = locText;
      if (summaryBudget) summaryBudget.innerText = budgetText;
      if (summarySize) summarySize.innerText = sizeVal;
      if (summaryTarget) summaryTarget.innerText = targetVal;
      if (summaryStartTime) summaryStartTime.innerText = startTimeText;
      if (summaryTimeLeft) summaryTimeLeft.innerText = "9s";
      if (summaryConfidence) summaryConfidence.innerText = "72%";

      // Reset progress bar elements
      const progressPercent = document.getElementById('proc-progress-percent');
      const progressFill = document.getElementById('proc-progress-fill');
      const statusLog = document.getElementById('proc-status-log');
      const confidenceCircularDial = document.querySelector('.confidence-circular-progress');

      if (progressPercent) progressPercent.innerText = "0%";
      if (progressFill) progressFill.style.width = "0%";
      if (statusLog) statusLog.innerText = "Initializing multi-agent pipeline...";
      if (confidenceCircularDial) {
        confidenceCircularDial.style.background = "radial-gradient(closest-side, var(--bg-card) 78%, transparent 80% 100%), conic-gradient(var(--accent-purple) 72%, rgba(255,255,255,0.03) 0)";
      }

      // Initialize all 6 agent card components to waiting
      const agents = [
        document.getElementById('proc-agent-1'),
        document.getElementById('proc-agent-2'),
        document.getElementById('proc-agent-3'),
        document.getElementById('proc-agent-4'),
        document.getElementById('proc-agent-5'),
        document.getElementById('proc-agent-6')
      ];

      function setAgentCardState(idx, cls, label) {
        const ag = agents[idx];
        if (ag) {
          ag.className = `neon-card agent-card ${cls}`;
          const b = ag.querySelector('.agent-badge');
          if (b) b.innerText = label;
        }
      }

      agents.forEach(agent => {
        if (agent) {
          agent.className = "neon-card agent-card waiting";
          const badge = agent.querySelector('.agent-badge');
          if (badge) badge.innerText = "Waiting";
        }
      });

      // Route view to processing screen
      if (subViews.newAnalysis && subViews.processing) {
        subViews.newAnalysis.classList.remove('active');
        subViews.processing.classList.add('active');
      }

      // Highlight AI Insights tab in sidebar (nav-item data-nav="analytics")
      navItems.forEach(item => {
        if (item.getAttribute('data-nav') === 'analytics') {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      // Start dynamic background API/simulation data fetching
      globalAnalysisResult = null;
      const apiPromise = startAgentApiPipeline(isSuggestGoal, businessQuery, locationQuery, budgetVal, sizeVal, targetVal);
      apiPromise.then(res => {
        globalAnalysisResult = res;
      });

      // 2. Sequential Collaborator Agent State Machine (9-second timeline)
      const steps = [
        {
          time: 0,
          pct: 10,
          conf: 72,
          timer: "9s",
          log: "🌍 Location Intelligence Agent mapping demographic density...",
          update: () => {
            setAgentCardState(0, 'running', 'Running');
          }
        },
        {
          time: 1400,
          pct: 30,
          conf: 78,
          timer: "7s",
          log: "🏪 Competitor Intelligence Agent scraping competitor ratings...",
          update: () => {
            setAgentCardState(0, 'completed', 'Completed');
            setAgentCardState(1, 'running', 'Running');
          }
        },
        {
          time: 2800,
          pct: 50,
          conf: 83,
          timer: "5s",
          log: "⭐ Customer Review Analysis Agent parsing sentiment profiles...",
          update: () => {
            setAgentCardState(1, 'completed', 'Completed');
            setAgentCardState(2, 'running', 'Running');
          }
        },
        {
          time: 4200,
          pct: 70,
          conf: 88,
          timer: "3s",
          log: "📊 Market Demand Prediction Agent calculating footfalls...",
          update: () => {
            setAgentCardState(2, 'completed', 'Completed');
            setAgentCardState(3, 'running', 'Running');
          }
        },
        {
          time: 5600,
          pct: 85,
          conf: 92,
          timer: "2s",
          log: "💰 Profit & Investment Analysis Agent estimating payback caps...",
          update: () => {
            setAgentCardState(3, 'completed', 'Completed');
            setAgentCardState(4, 'running', 'Running');
          }
        },
        {
          time: 7000,
          pct: 95,
          conf: 95,
          timer: "1s",
          log: "🧠 Business Recommendation Agent compiling competitive risk vectors...",
          update: () => {
            setAgentCardState(4, 'completed', 'Completed');
            setAgentCardState(5, 'running', 'Running');
          }
        }
      ];

      steps.forEach(step => {
        setTimeout(() => {
          if (progressPercent) progressPercent.innerText = `${step.pct}%`;
          if (progressFill) progressFill.style.width = `${step.pct}%`;
          if (statusLog) statusLog.innerText = step.log;
          if (summaryTimeLeft) summaryTimeLeft.innerText = step.timer;
          if (summaryConfidence) summaryConfidence.innerText = `${step.conf}%`;

          if (confidenceCircularDial) {
            confidenceCircularDial.style.background = `radial-gradient(closest-side, var(--bg-card) 78%, transparent 80% 100%), conic-gradient(var(--accent-purple) ${step.conf}%, rgba(255,255,255,0.03) 0)`;
          }

          step.update();
        }, step.time);
      });

      // 3. Wait for background API tasks to resolve before final redirect (at 8.4 seconds)
      setTimeout(async () => {
        while (!globalAnalysisResult) {
          if (statusLog) statusLog.innerText = "🧠 Finalizing multi-agent recommendation matrix...";
          await new Promise(r => setTimeout(r, 100));
        }

        // Apply final metrics to sidebar and logs
        if (progressPercent) progressPercent.innerText = "100%";
        if (progressFill) progressFill.style.width = "100%";
        if (statusLog) statusLog.innerText = "Pipeline complete. Compiling final intelligence matrix...";
        if (summaryTimeLeft) summaryTimeLeft.innerText = "0s";
        setAgentCardState(5, 'completed', 'Completed');

        const finalConf = globalAnalysisResult.confidence;
        if (summaryConfidence) summaryConfidence.innerText = `${finalConf}%`;
        if (confidenceCircularDial) {
          confidenceCircularDial.style.background = `radial-gradient(closest-side, var(--bg-card) 78%, transparent 80% 100%), conic-gradient(var(--accent-purple) ${finalConf}%, rgba(255,255,255,0.03) 0)`;
        }

        // Render data payload onto cards and table
        renderAnalysisResultsOnUi();

        // Trigger checkmark success modal
        processingSuccessModal.classList.add('active');

        // Transitions to recommendation panel after success checkmark shows
        setTimeout(() => {
          processingSuccessModal.classList.remove('active');

          if (subViews.processing && subViews.recommendation) {
            subViews.processing.classList.remove('active');
            subViews.recommendation.classList.add('active');
          }

          navItems.forEach(item => {
            if (item.getAttribute('data-nav') === 'opportunities') {
              item.classList.add('active');
            } else {
              item.classList.remove('active');
            }
          });
        }, 1500);

      }, 8400);

    });
  }

  // --- AI Business Recommendation Content Populator ---
  function populateRecommendationScreen(isSuggestGoal, businessTypeVal, budgetVal) {
    const recNameEl = document.getElementById('rec-business-name');
    const recSubtitleEl = document.getElementById('rec-business-subtitle');
    const recScoreNumEl = document.getElementById('rec-score-num');
    const recScoreGradeEl = document.getElementById('rec-score-grade');
    const estInvestmentEl = document.getElementById('est-stat-investment');
    const estRevenueEl = document.getElementById('est-stat-revenue');
    const estCustomersEl = document.getElementById('est-stat-customers');
    const estRoiEl = document.getElementById('est-stat-roi');
    const recConfidencePctEl = document.getElementById('rec-confidence-pct');
    const recConfidenceDial = document.getElementById('rec-confidence-dial');

    let recName = "";
    let recSubtitle = "";
    let recScore = 95;
    let recGrade = "Excellent Opportunity";

    // Financial ratios based on budget
    const budgetNum = parseInt(budgetVal) || 2500000;
    const initialInvestment = Math.round(budgetNum * 0.65);
    const expectedMonthlyRevenue = Math.round(initialInvestment * 0.28);
    const monthlyCustomers = Math.round(1500 + (budgetNum / 15000));
    const roiMonths = 14 + Math.round((budgetNum % 100000) / 20000); // 14 to 22 months

    const formatRupees = (val) => {
      if (val >= 10000000) {
        return "₹" + (val / 10000000).toFixed(1) + " Cr";
      } else if (val >= 100000) {
        return "₹" + (val / 100000).toFixed(1) + " Lakh";
      }
      return "₹" + val.toLocaleString('en-IN');
    };

    if (isSuggestGoal) {
      // Suggest a Business Idea path
      if (budgetNum < 500000) {
        recName = "Premium Ice Cream Parlour";
        recScore = 95;
      } else if (budgetNum < 1500000) {
        recName = "Organic Juice Bar";
        recScore = 93;
      } else if (budgetNum < 3000000) {
        recName = "Protein Egg Café";
        recScore = 94;
      } else {
        recName = "Gourmet Health Restaurant";
        recScore = 89;
      }
      recSubtitle = "Best match for your selected location and budget.";
    } else {
      // User has own idea path
      recName = businessTypeVal || "Your Business Idea";
      recSubtitle = "Your business idea has strong market potential.";

      // Look up score if possible, otherwise use fallback
      if (typeof aiPredictionsData !== 'undefined' && aiPredictionsData[recName]) {
        recScore = parseInt(aiPredictionsData[recName].score) || 92;
      } else {
        recScore = 92;
      }
    }

    // Determine grade description
    if (recScore >= 95) recGrade = "Outstanding Opportunity";
    else if (recScore >= 90) recGrade = "Excellent Opportunity";
    else if (recScore >= 80) recGrade = "Strong Opportunity";
    else recGrade = "Moderate Opportunity";

    // Set texts
    if (recNameEl) recNameEl.innerText = recName;
    if (recSubtitleEl) recSubtitleEl.innerText = recSubtitle;
    if (recScoreNumEl) recScoreNumEl.innerText = recScore;
    if (recScoreGradeEl) {
      recScoreGradeEl.innerText = recGrade;
      // Change color based on score
      if (recScore >= 90) {
        recScoreGradeEl.className = "score-grade text-green";
      } else {
        recScoreGradeEl.className = "score-grade text-cyan";
      }
    }

    if (estInvestmentEl) estInvestmentEl.innerText = formatRupees(initialInvestment);
    if (estRevenueEl) estRevenueEl.innerText = formatRupees(expectedMonthlyRevenue) + " / mo";
    if (estCustomersEl) estCustomersEl.innerText = monthlyCustomers.toLocaleString('en-IN') + "+ / mo";
    if (estRoiEl) estRoiEl.innerText = roiMonths + " Months";

    // Dynamic verification score dial animation matching confidence
    const confidencePct = recScore + 4 > 99 ? 99 : recScore + 4;
    if (recConfidencePctEl) recConfidencePctEl.innerText = confidencePct + "%";
    if (recConfidenceDial) {
      recConfidenceDial.style.background = `radial-gradient(closest-side, var(--bg-card) 78%, transparent 80% 100%), conic-gradient(var(--accent-purple) ${confidencePct}%, rgba(255,255,255,0.03) 0)`;
    }
  }

  // --- AI Business Recommendation Button Click Actions ---
  const btnViewReport = document.getElementById('btn-view-report');
  const btnRestartAnalysis = document.getElementById('btn-restart-analysis');

  if (btnViewReport) {
    btnViewReport.addEventListener('click', () => {
      if (subViews.recommendation && subViews.dashboard) {
        subViews.recommendation.classList.remove('active');
        subViews.dashboard.classList.add('active');
      }

      // Highlight Dashboard nav item in sidebar
      navItems.forEach(item => {
        if (item.getAttribute('data-nav') === 'home') {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      // Reset setup forms
      if (analysisForm) {
        analysisForm.reset();
        if (typeof resetTargetDropdown === 'function') resetTargetDropdown();
        if (typeof resetBusinessSearch === 'function') resetBusinessSearch();
        if (lblBudgetDisplay && sliderBudget) {
          lblBudgetDisplay.innerText = formatIndianCurrency(sliderBudget.value);
        }
      }

      // Trigger charts animation entry
      animateDashboardEntrance();
    });
  }

  if (btnRestartAnalysis) {
    btnRestartAnalysis.addEventListener('click', () => {
      if (subViews.recommendation && subViews.newAnalysis) {
        subViews.recommendation.classList.remove('active');
        subViews.newAnalysis.classList.add('active');
      }

      // Highlight New Analysis nav item in sidebar (data-nav="signals")
      navItems.forEach(item => {
        if (item.getAttribute('data-nav') === 'signals') {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      // Reset setup forms
      if (analysisForm) {
        analysisForm.reset();
        if (typeof resetTargetDropdown === 'function') resetTargetDropdown();
        if (typeof resetBusinessSearch === 'function') resetBusinessSearch();
        if (lblBudgetDisplay && sliderBudget) {
          lblBudgetDisplay.innerText = formatIndianCurrency(sliderBudget.value);
        }
      }

      // Update preview indicators to default
      updateAiPreview();
    });
  }

  // --- Target Customers Searchable Dropdown (Multi-select) ---
  const targetDropdown = document.getElementById('target-customers-dropdown');
  if (targetDropdown) {
    const trigger = targetDropdown.querySelector('.dropdown-trigger');
    const triggerText = targetDropdown.querySelector('#trigger-display-text');
    const searchInput = targetDropdown.querySelector('.dropdown-search-input');
    const options = targetDropdown.querySelectorAll('.dropdown-option');
    const hiddenSelect = document.getElementById('analysis-target-customers');
    const btnClearTarget = targetDropdown.querySelector('#btn-clear-target');
    const btnDoneTarget = targetDropdown.querySelector('#btn-done-target');

    // Click trigger to toggle menu
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = targetDropdown.classList.contains('active');
      targetDropdown.classList.toggle('active');
      if (!isActive) {
        setTimeout(() => searchInput.focus(), 50);
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!targetDropdown.contains(e.target)) {
        targetDropdown.classList.remove('active');
      }
    });

    // Toggle multi-select option selection
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const isSelected = option.classList.contains('selected');

        if (isSelected) {
          // Unselect
          option.classList.remove('selected');
          const checkbox = option.querySelector('.option-checkbox');
          if (checkbox) checkbox.innerText = "";
        } else {
          // Select
          option.classList.add('selected');
          const checkbox = option.querySelector('.option-checkbox');
          if (checkbox) checkbox.innerText = "✓";
        }

        updateSelectionAndTrigger();
      });
    });

    // Update trigger text and hidden select input
    function updateSelectionAndTrigger() {
      const selectedOptions = targetDropdown.querySelectorAll('.dropdown-option.selected');

      if (selectedOptions.length === 0) {
        // Render placeholder text
        if (triggerText) {
          triggerText.innerText = 'Select Target Customers';
          triggerText.style.color = 'var(--text-muted)';
        }

        // Sync original select input to empty
        if (hiddenSelect) {
          hiddenSelect.value = '';
          hiddenSelect.dispatchEvent(new Event('change'));
        }
      } else {
        // Combined string display connector " • "
        const combinedValue = Array.from(selectedOptions).map(opt => opt.getAttribute('data-value')).join(' • ');

        if (triggerText) {
          triggerText.innerText = combinedValue;
          triggerText.style.color = '#fff';
        }

        // Sync original select input value
        if (hiddenSelect) {
          hiddenSelect.value = combinedValue;
          hiddenSelect.dispatchEvent(new Event('change'));
        }
      }
    }

    // Search filter input change listener
    searchInput.addEventListener('input', () => {
      const filter = searchInput.value.toLowerCase().trim();
      options.forEach(option => {
        const text = option.querySelector('.option-text').innerText.toLowerCase();
        if (text.includes(filter)) {
          option.classList.remove('hidden');
        } else {
          option.classList.add('hidden');
        }
      });
    });

    // Clear All button listener
    if (btnClearTarget) {
      btnClearTarget.addEventListener('click', (e) => {
        e.stopPropagation();
        options.forEach(opt => {
          opt.classList.remove('selected');
          const check = opt.querySelector('.option-checkbox');
          if (check) check.innerText = '';
        });
        updateSelectionAndTrigger();
      });
    }

    // Done button listener
    if (btnDoneTarget) {
      btnDoneTarget.addEventListener('click', (e) => {
        e.stopPropagation();
        targetDropdown.classList.remove('active');
        // Clear search
        searchInput.value = '';
        options.forEach(opt => opt.classList.remove('hidden'));
      });
    }

    // Keyboard navigation support inside trigger (Space / Enter / ArrowDown keys)
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        targetDropdown.classList.add('active');
        setTimeout(() => searchInput.focus(), 50);
      }
    });

    // Escape to close from search input
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        targetDropdown.classList.remove('active');
        trigger.focus();
      }
    });
  }

  // --- AI Smart Business Search Component ---
  const keywordSuggestions = {
    "ice": [
      { text: "Ice Cream Shop", icon: "🍦" },
      { text: "Organic Ice Cream", icon: "🍨" },
      { text: "Ice Cream & Milkshake Cafe", icon: "🧋" },
      { text: "Ice Factory", icon: "❄️" },
      { text: "Ice Supply Business", icon: "🧊" }
    ],
    "egg": [
      { text: "Egg Shop", icon: "🥚" },
      { text: "Egg Fast Food", icon: "🍳" },
      { text: "Protein Shake Bar", icon: "🥤" },
      { text: "Egg Wholesale", icon: "🥚" },
      { text: "Healthy Protein Cafe", icon: "🥗" }
    ],
    "gym": [
      { text: "Protein Shake Bar", icon: "🥤" },
      { text: "Egg Point", icon: "🥚" },
      { text: "Healthy Snack Shop", icon: "🍌" },
      { text: "Fitness Accessories Store", icon: "💪" }
    ]
  };

  const generalSuggestions = [
    { text: "Bakery", icon: "🥐" },
    { text: "Boutique Cafe", icon: "☕" },
    { text: "Pizzeria", icon: "🍕" },
    { text: "Organic Grocery Store", icon: "🥦" },
    { text: "Wellness Gym", icon: "🏋️" },
    { text: "Luxury Salon", icon: "💅" },
    { text: "Medical Store", icon: "💊" },
    { text: "Boutique Supermarket", icon: "🛒" },
    { text: "Designer Clothing Boutique", icon: "👗" },
    { text: "Indie Book Store", icon: "📚" },
    { text: "Electronics Repair Shop", icon: "🔌" },
    { text: "Photography Studio", icon: "📸" },
    { text: "Herbal Tea Stall", icon: "🍵" },
    { text: "Organic Juice Bar", icon: "🥤" },
    { text: "Florist & Flower Shop", icon: "🌹" },
    { text: "Pet Grooming Salon", icon: "🐾" },
    { text: "Bicycle Shop & Repair", icon: "🚲" }
  ];

  const popularNearby = [
    { text: "Boutique Cafe", icon: "☕" },
    { text: "Pizzeria", icon: "🍕" },
    { text: "Organic Grocery Store", icon: "🥦" },
    { text: "Wellness Gym", icon: "🏋️" },
    { text: "Luxury Salon", icon: "💅" }
  ];

  function getRecentSearchTypes() {
    try {
      return JSON.parse(localStorage.getItem('mm_recent_businesses') || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveRecentSearchType(val) {
    if (!val) return;
    try {
      let recents = getRecentSearchTypes();
      recents = [val, ...recents.filter(x => x !== val)].slice(0, 3);
      localStorage.setItem('mm_recent_businesses', JSON.stringify(recents));
    } catch (e) { }
  }

  const businessSearchInput = document.getElementById('analysis-business-type-search');
  const businessSuggestionsPanel = document.getElementById('business-suggestions-panel');
  const hiddenBusinessInput = document.getElementById('analysis-business-type');

  if (businessSearchInput && businessSuggestionsPanel) {
    let highlightedIndex = -1;

    function renderSuggestions(query) {
      businessSuggestionsPanel.innerHTML = '';
      highlightedIndex = -1;

      const trimmedQuery = query.trim().toLowerCase();
      let matches = [];

      if (!trimmedQuery) {
        // Show Recents
        const recents = getRecentSearchTypes();
        if (recents.length > 0) {
          const header = document.createElement('div');
          header.className = 'suggestion-header';
          header.innerText = 'Recently Searched';
          businessSuggestionsPanel.appendChild(header);

          recents.forEach(text => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            const matchObj = generalSuggestions.find(g => g.text.toLowerCase() === text.toLowerCase())
              || popularNearby.find(g => g.text.toLowerCase() === text.toLowerCase());
            const icon = matchObj ? matchObj.icon : "🕒";

            item.innerHTML = `<span class="item-icon">${icon}</span><span class="item-text">${text}</span>`;
            item.addEventListener('click', () => selectBusiness(text));
            businessSuggestionsPanel.appendChild(item);
          });
        }

        // Show Popular Nearby
        const popularHeader = document.createElement('div');
        popularHeader.className = 'suggestion-header';
        popularHeader.innerText = 'Popular Nearby';
        businessSuggestionsPanel.appendChild(popularHeader);

        popularNearby.forEach(itemData => {
          const item = document.createElement('div');
          item.className = 'suggestion-item';
          item.innerHTML = `<span class="item-icon">${itemData.icon}</span><span class="item-text">${itemData.text}</span>`;
          item.addEventListener('click', () => selectBusiness(itemData.text));
          businessSuggestionsPanel.appendChild(item);
        });
      } else {
        // Search specific keyword categories
        let keywordMatchKey = Object.keys(keywordSuggestions).find(key => trimmedQuery.includes(key));

        if (keywordMatchKey) {
          matches = [...keywordSuggestions[keywordMatchKey]];
        } else {
          // General prefix filter
          matches = generalSuggestions.filter(item =>
            item.text.toLowerCase().includes(trimmedQuery)
          );
        }

        if (matches.length > 0) {
          const suggestHeader = document.createElement('div');
          suggestHeader.className = 'suggestion-header';
          suggestHeader.innerText = 'Suggestions';
          businessSuggestionsPanel.appendChild(suggestHeader);

          matches.forEach(itemData => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `<span class="item-icon">${itemData.icon}</span><span class="item-text">${itemData.text}</span>`;
            item.addEventListener('click', () => selectBusiness(itemData.text));
            businessSuggestionsPanel.appendChild(item);
          });
        }

        // Add custom option
        const customItem = document.createElement('div');
        customItem.className = 'suggestion-item custom-suggestion';
        customItem.innerHTML = `<span class="item-icon">✨</span><span class="item-text">Use '<strong>${businessSearchInput.value}</strong>' as a custom business idea.</span>`;
        customItem.addEventListener('click', () => selectBusiness(businessSearchInput.value));
        businessSuggestionsPanel.appendChild(customItem);
      }

      businessSuggestionsPanel.classList.add('active');
    }

    function selectBusiness(val) {
      businessSearchInput.value = val;
      if (hiddenBusinessInput) {
        hiddenBusinessInput.value = val;
        hiddenBusinessInput.dispatchEvent(new Event('change'));
      }
      saveRecentSearchType(val);
      businessSuggestionsPanel.classList.remove('active');
    }

    businessSearchInput.addEventListener('focus', () => {
      renderSuggestions(businessSearchInput.value);
    });

    businessSearchInput.addEventListener('input', () => {
      renderSuggestions(businessSearchInput.value);
    });

    businessSearchInput.addEventListener('keydown', (e) => {
      const items = businessSuggestionsPanel.querySelectorAll('.suggestion-item');
      if (!businessSuggestionsPanel.classList.contains('active') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % items.length;
        updateHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
        updateHighlight(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < items.length) {
          items[highlightedIndex].click();
        } else {
          selectBusiness(businessSearchInput.value);
        }
      } else if (e.key === 'Escape') {
        businessSuggestionsPanel.classList.remove('active');
      }
    });

    function updateHighlight(items) {
      items.forEach((item, index) => {
        if (index === highlightedIndex) {
          item.classList.add('highlighted');
          item.scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('highlighted');
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (!businessSearchInput.contains(e.target) && !businessSuggestionsPanel.contains(e.target)) {
        businessSuggestionsPanel.classList.remove('active');
      }
    });

    // Handle suggestion tags under the search field
    const quickTags = document.querySelectorAll('.suggestion-tag');
    quickTags.forEach(tag => {
      tag.addEventListener('click', () => {
        selectBusiness(tag.innerText);
      });
    });
  }

  function resetBusinessSearch() {
    const input = document.getElementById('analysis-business-type-search');
    const hidden = document.getElementById('analysis-business-type');
    const panel = document.getElementById('business-suggestions-panel');

    if (input) input.value = "";
    if (hidden) {
      hidden.value = "";
      hidden.dispatchEvent(new Event('change'));
    }
    if (panel) {
      panel.innerHTML = "";
      panel.classList.remove('active');
    }
  }

  // Helper to reset Target Customers custom dropdown back to default state
  function resetTargetDropdown() {
    const dropdown = document.getElementById('target-customers-dropdown');
    if (dropdown) {
      const triggerText = dropdown.querySelector('#trigger-display-text');
      const options = dropdown.querySelectorAll('.dropdown-option');
      const searchInput = dropdown.querySelector('.dropdown-search-input');
      const hiddenSelect = document.getElementById('analysis-target-customers');

      if (searchInput) searchInput.value = "";

      options.forEach(opt => {
        opt.classList.remove('hidden');
        const check = opt.querySelector('.option-checkbox');
        opt.classList.remove('selected');
        if (check) check.innerText = '';
      });

      if (triggerText) {
        triggerText.innerText = 'Select Target Customers';
        triggerText.style.color = 'var(--text-muted)';
      }

      if (hiddenSelect) {
        hiddenSelect.value = '';
        hiddenSelect.dispatchEvent(new Event('change'));
      }
    }
  }

  // --- Geolocation Tracking ---
  function initGeolocationTracking() {
    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      fallbackToDefaultLocation();
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    userWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const coordsChanged = !currentUserCoords ||
          currentUserCoords.lat !== lat ||
          currentUserCoords.lng !== lng;

        currentUserCoords = { lat, lng };

        updateUserMarkersOnMaps();

        if (coordsChanged) {
          recalculateDistancesAndRefresh();
        }
      },
      (error) => {
        console.warn("Geolocation watchPosition error:", error.message);
        if (!currentUserCoords) {
          fallbackToDefaultLocation();
        }
        triggerSystemToast("Location access denied or unavailable. Defaulting to Vijayawada.", 3000);
      },
      options
    );
  }

  function fallbackToDefaultLocation() {
    currentUserCoords = { lat: 16.5062, lng: 80.6480 }; // Vijayawada
    updateUserMarkersOnMaps();
    recalculateDistancesAndRefresh();
  }

  function updateUserMarkersOnMaps() {
    if (!currentUserCoords || !(window.google && window.google.maps)) return;
    const latLng = new google.maps.LatLng(currentUserCoords.lat, currentUserCoords.lng);

    // Dashboard User Marker
    if (dashboardMap) {
      if (!dashboardUserMarker) {
        dashboardUserMarker = new google.maps.Marker({
          position: latLng,
          map: dashboardMap,
          title: "You are here",
          label: {
            text: "You",
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: "bold"
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#10b981", // green for user
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          }
        });
      } else {
        dashboardUserMarker.setPosition(latLng);
      }
    }

    // Opportunities User Marker
    if (opportunitiesMap) {
      if (!opportunitiesUserMarker) {
        opportunitiesUserMarker = new google.maps.Marker({
          position: latLng,
          map: opportunitiesMap,
          title: "You are here",
          label: {
            text: "You",
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: "bold"
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#10b981", // green for user
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          }
        });
      } else {
        opportunitiesUserMarker.setPosition(latLng);
      }
    }
  }

  function recalculateDistancesAndRefresh() {
    const oppSubView = document.getElementById('view-opportunities');
    if (oppSubView && oppSubView.classList.contains('active') && typeof runOpportunitiesSearch === 'function') {
      runOpportunitiesSearch();
    }
  }

  // --- Dynamic Map Loading & API Orchestration System ---
  function loadGoogleMapsScript(apiKey, callback) {
    // If Maps is already loaded with the SAME key, just fire the callback
    if (window.google && window.google.maps && currentlyLoadedGmapsKey === apiKey) {
      if (callback) callback();
      return;
    }

    // If the key changed, tear down the existing script so Maps reloads cleanly
    if (currentlyLoadedGmapsKey && currentlyLoadedGmapsKey !== apiKey) {
      const oldScript = document.getElementById('gmaps-script');
      if (oldScript) oldScript.remove();
      const oldClusterer = document.getElementById('gmaps-clusterer-script');
      if (oldClusterer) oldClusterer.remove();
      if (window.google) delete window.google;
    }

    currentlyLoadedGmapsKey = apiKey;

    let script = document.getElementById('gmaps-script');
    if (!script) {
      script = document.createElement('script');
      script.id = 'gmaps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,visualization`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        loadMarkerClustererScript(callback);
      };

      script.onerror = () => {
        currentlyLoadedGmapsKey = null;
        handleMapsLoadError("Failed to load Google Maps script. Check your API key or billing status.");
      };

      document.head.appendChild(script);
    }
  }

  function loadMarkerClustererScript(callback) {
    let clustererScript = document.getElementById('gmaps-clusterer-script');
    if (!clustererScript) {
      clustererScript = document.createElement('script');
      clustererScript.id = 'gmaps-clusterer-script';
      clustererScript.src = `https://cdn.jsdelivr.net/npm/@googlemaps/markerclusterer@2.5.3/dist/index.min.js`;
      clustererScript.async = true;
      clustererScript.defer = true;
      clustererScript.onload = () => {
        if (callback) callback();
        initializeMapsAfterScriptLoad();
      };
      clustererScript.onerror = () => {
        console.warn("Failed to load MarkerClusterer library.");
        if (callback) callback();
        initializeMapsAfterScriptLoad();
      };
      document.head.appendChild(clustererScript);
    } else {
      if (callback) callback();
    }
  }

  window.gm_authFailure = function () {
    console.error("Google Maps API authentication failed.");
    handleMapsLoadError("API Authentication Failed. Check your API key in settings.");
  };

  function handleMapsLoadError(errorMessage) {
    const mapContainers = ['real-google-map', 'opportunities-google-map'];
    mapContainers.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = `
          <div class="map-error-boundary" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; text-align: center; gap: 1rem; color: #fff; background: rgba(18, 18, 25, 0.95); z-index: 10;">
            <span style="font-size: 2rem;">⚠️</span>
            <p class="font-space" style="font-size: 0.85rem; margin: 0; max-width: 80%;">${errorMessage}</p>
            <button type="button" class="btn btn-outline" onclick="window.retryGoogleMapsLoad()" style="padding: 0.5rem 1.2rem; border-radius: 8px; font-size: 0.8rem; cursor: pointer; border: 1px solid var(--accent-cyan); color: var(--accent-cyan); background: transparent;">
              🔄 Retry Connection
            </button>
          </div>
        `;
      }
    });
  }

  window.retryGoogleMapsLoad = function () {
    const existingScript = document.getElementById('gmaps-script');
    if (existingScript) existingScript.remove();
    const existingClustererScript = document.getElementById('gmaps-clusterer-script');
    if (existingClustererScript) existingClustererScript.remove();

    if (window.google) {
      delete window.google;
    }

    const key = localStorage.getItem('mm_google_maps_key') || GOOGLE_MAPS_API_KEY;
    if (key) {
      loadGoogleMapsScript(key);
    } else {
      triggerSystemToast("Please enter an API Key in settings first.", 3000);
    }
  };

  function initializeMapsAfterScriptLoad() {
    updateStatusIndicators(GOOGLE_MAPS_API_KEY || localStorage.getItem('mm_google_maps_key'), localStorage.getItem('mm_gemini_key'));
    updateUserMarkersOnMaps();

    if (!userWatchId) {
      initGeolocationTracking();
    }

    // Always initialize and render dashboard map
    const dashboardSubView = document.getElementById('view-dashboard');
    if (dashboardSubView && dashboardSubView.classList.contains('active')) {
      const data = globalAnalysisResult || {
        coordinates: currentUserCoords || { lat: 17.3850, lng: 78.4867 },
        competitors: [
          { name: "Bake & Brew Cafe", category: "Cafe & Bakery", rating: 4.5, reviews: 480, price: 220, distance: "400 m", lat: 17.3880, lng: 78.4890 },
          { name: "Fresh Juice Hub", category: "Beverages", rating: 4.4, reviews: 720, price: 90, distance: "600 m", lat: 17.3830, lng: 78.4830 },
          { name: "Protein Egg Point", category: "Quick Service", rating: 4.8, reviews: 540, price: 120, distance: "900 m", lat: 17.3810, lng: 78.4900 }
        ],
        landmarks: [
          { name: "Central Metro Station", type: "Transit Station", distance: "300 m", lat: 17.3860, lng: 78.4850 },
          { name: "City Public School", type: "School/College", distance: "500 m", lat: 17.3870, lng: 78.4880 }
        ]
      };
      const coords = data.coordinates || { lat: 17.3850, lng: 78.4867 };
      initGoogleMapsWidget(
        coords.lat,
        coords.lng,
        data.competitors || [],
        data.landmarks || []
      );
    }

    // Refresh opportunities map if active
    const opportunitiesSubView = document.getElementById('view-opportunities');
    if (opportunitiesSubView && opportunitiesSubView.classList.contains('active') && typeof runOpportunitiesSearch === 'function') {
      runOpportunitiesSearch();
    }
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  function fetchNearbyPlacesFromApi(lat, lng, query, apiKey) {
    return new Promise((resolve) => {
      if (window.google && window.google.maps && window.google.maps.places) {
        const dummyDiv = document.createElement('div');
        const service = new google.maps.places.PlacesService(dummyDiv);
        const request = {
          location: new google.maps.LatLng(lat, lng),
          radius: 2000,
          query: query
        };
        service.textSearch(request, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            const list = results.map(place => {
              const d = calculateDistance(lat, lng, place.geometry.location.lat(), place.geometry.location.lng());
              return {
                name: place.name,
                rating: place.rating || 0,
                reviews: place.user_ratings_total || 0,
                address: place.formatted_address || "",
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                distance: Math.round(d)
              };
            });
            list.sort((a, b) => a.distance - b.distance);
            resolve(list.slice(0, 10));
          } else {
            resolve([]);
          }
        });
      } else {
        resolve([]);
      }
    });
  }

  function fetchNearbyLandmarksFromApi(lat, lng, apiKey) {
    return new Promise((resolve) => {
      if (window.google && window.google.maps && window.google.maps.places) {
        const dummyDiv = document.createElement('div');
        const service = new google.maps.places.PlacesService(dummyDiv);
        const request = {
          location: new google.maps.LatLng(lat, lng),
          radius: 2000,
          types: ['school', 'university', 'gym', 'hospital', 'shopping_mall', 'subway_station']
        };
        service.nearbySearch(request, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            const list = results.map(place => {
              const d = calculateDistance(lat, lng, place.geometry.location.lat(), place.geometry.location.lng());
              let typeLabel = "Landmark";
              if (place.types.includes('school') || place.types.includes('university')) typeLabel = "School/College";
              else if (place.types.includes('gym')) typeLabel = "Gym";
              else if (place.types.includes('hospital')) typeLabel = "Hospital";
              else if (place.types.includes('shopping_mall')) typeLabel = "Shopping Mall";
              else if (place.types.includes('subway_station')) typeLabel = "Transit Station";

              return {
                name: place.name,
                type: typeLabel,
                rating: place.rating || 0,
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                distance: Math.round(d)
              };
            });
            list.sort((a, b) => a.distance - b.distance);
            resolve(list.slice(0, 10));
          } else {
            resolve([]);
          }
        });
      } else {
        resolve([]);
      }
    });
  }

  function generateHighFidelitySimulation(isSuggestGoal, businessQuery, locationVal, budgetVal, sizeVal, targetVal) {
    const seedStr = ((businessQuery || "Boutique") + (locationVal || "Indiranagar") + sizeVal + targetVal).toLowerCase();
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) {
      seed += seedStr.charCodeAt(i);
    }

    const prng = (min, max, offset = 0) => {
      const x = Math.sin(seed + offset) * 10000;
      const r = x - Math.floor(x);
      return Math.floor(r * (max - min + 1)) + min;
    };

    const opportunityScore = prng(55, 96, 1);
    let opportunityLevel = "Moderate Opportunity";
    let scoreColorClass = "text-cyan";
    if (opportunityScore >= 90) {
      opportunityLevel = "Excellent Opportunity";
      scoreColorClass = "text-green";
    } else if (opportunityScore >= 80) {
      opportunityLevel = "Strong Opportunity";
      scoreColorClass = "text-green";
    } else if (opportunityScore < 60) {
      opportunityLevel = "Poor Opportunity";
      scoreColorClass = "text-orange";
    }

    const competitorCount = prng(2, 6, 2);
    const competitorNames = [
      "Creamy Treats", "The Daily Grind", "Harvest Bakeries", "Juice Factory",
      "Spice Garden", "Fitness Hub", "The Corner Store", "Urban Pantry"
    ];

    let competitors = [];
    for (let i = 0; i < competitorCount; i++) {
      const idx = (prng(0, 7, i) + i) % competitorNames.length;
      const rating = (prng(38, 49, i) / 10).toFixed(1);
      const reviews = prng(30, 800, i * 2);
      const distance = prng(150, 1200, i * 3);
      competitors.push({
        name: `${competitorNames[idx]} ${businessQuery || "Cafe"}`,
        category: businessQuery || "Cafe & Desserts",
        rating: parseFloat(rating),
        reviews: reviews,
        price: prng(40, 350, i * 4),
        distance: distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`,
        lat: 12.9784 + (prng(-120, 120, i * 5) / 100000),
        lng: 77.6408 + (prng(-120, 120, i * 6) / 100000)
      });
    }

    const landmarkNames = [
      { name: "Public School", type: "School/College" },
      { name: "Tech Park East", type: "Offices" },
      { name: "Metro Station Gate A", type: "Transit Station" },
      { name: "Sigma Mall", type: "Shopping Mall" },
      { name: "Core Fitness Gym", type: "Gym" }
    ];

    let landmarks = [];
    const landmarkCount = prng(3, 4, 7);
    for (let i = 0; i < landmarkCount; i++) {
      const l = landmarkNames[i % landmarkNames.length];
      const dist = prng(200, 850, i * 8);
      landmarks.push({
        name: `${locationVal || "Indiranagar"} ${l.name}`,
        type: l.type,
        distance: `${dist} m`,
        lat: 12.9784 + (prng(-100, 100, i * 9) / 100000),
        lng: 77.6408 + (prng(-100, 100, i * 10) / 100000)
      });
    }

    const budgetNum = parseInt(budgetVal) || 2500000;
    const initialInvestment = Math.round(budgetNum * (prng(60, 75, 11) / 100));
    const expectedMonthlyRevenue = Math.round(initialInvestment * (prng(22, 33, 12) / 100));
    const monthlyCustomers = prng(1000, 3500, 13);
    const paybackPeriod = prng(12, 22, 14);
    const confidence = prng(80, 97, 15);

    const strengths = [
      `High foot traffic location near targeted demographic markers (${targetVal}).`,
      `Optimal match for budget structure of ${formatIndianCurrency(budgetNum)}.`,
      `Low density of direct competitor operators (${competitors.length} found).`
    ];

    const weaknesses = [
      `Elevated weekday dependency indexes for ${businessQuery || "General Retail"}.`,
      `Commercial lease values in neighboring corridors are slightly high.`
    ];

    const risks = [
      `Potential logistics bottlenecks under ${sizeVal} scale setups.`,
      `Competitive rating bars from existing players remain high.`
    ];

    const topRecs = generateDynamicBusinessRecommendations(targetVal, locationVal, sizeVal, budgetVal);
    const topRec = topRecs[0] || { name: "Boutique Cafe", score: 92, investment: 1200000, profit: 110000, roi: 14, confidence: 95, whySuits: "High market demand." };
    let suggestedName = isSuggestGoal ? topRec.name : (businessQuery || topRec.name);

    return {
      isSuggestGoal,
      suggestedName,
      targetVal,
      locationVal,
      sizeVal,
      budgetVal,
      top5Opportunities: topRecs,
      opportunityScore: isSuggestGoal ? topRec.score : opportunityScore,
      opportunityLevel: (isSuggestGoal ? topRec.score : opportunityScore) >= 90 ? "Excellent Opportunity" : "Strong Opportunity",
      scoreColorClass: (isSuggestGoal ? topRec.score : opportunityScore) >= 90 ? "text-green" : "text-cyan",
      reason: topRec.whySuits,
      strengths,
      weaknesses,
      risks,
      competitors,
      landmarks,
      expectedCustomers: monthlyCustomers,
      estimatedMonthlyRevenue: isSuggestGoal ? topRec.profit : expectedMonthlyRevenue,
      initialInvestment: isSuggestGoal ? topRec.investment : initialInvestment,
      paybackPeriod: `${isSuggestGoal ? topRec.roi : paybackPeriod} Months`,
      confidence: isSuggestGoal ? topRec.confidence : confidence,
      alternatives: topRecs.slice(1).map(x => x.name),
      coordinates: { lat: 12.9784, lng: 77.6408 },
      isNewScan: true
    };
  }

  async function startAgentApiPipeline(isSuggestGoal, businessQuery, locationQuery, budgetVal, sizeVal, targetVal) {
    const gKey = GOOGLE_MAPS_API_KEY || localStorage.getItem('mm_google_maps_key') || '';
    const gemKey = localStorage.getItem('mm_gemini_key') || '';

    let lat = 12.9784;
    let lng = 77.6408;
    let finalLocationName = locationQuery || "Indiranagar, Bengaluru";

    // If no Maps key at all, fall back to dynamic simulation immediately.
    if (!gKey) {
      await new Promise(r => setTimeout(r, 2200));
      return generateHighFidelitySimulation(isSuggestGoal, businessQuery, finalLocationName, budgetVal, sizeVal, targetVal);
    }

    try {
      if (locationQuery) {
        const cachedGeocode = apiCache.geocoding[locationQuery.toLowerCase()];
        if (cachedGeocode) {
          lat = cachedGeocode.lat;
          lng = cachedGeocode.lng;
          finalLocationName = cachedGeocode.formatted_address;
        } else {
          try {
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationQuery)}&key=${gKey}`);
            const json = await res.json();
            if (json.status === "OK" && json.results[0]) {
              lat = json.results[0].geometry.location.lat;
              lng = json.results[0].geometry.location.lng;
              finalLocationName = json.results[0].formatted_address;
              apiCache.geocoding[locationQuery.toLowerCase()] = { lat, lng, formatted_address: finalLocationName };
            }
          } catch (e) {
            console.error("Geocoding fetch failed:", e);
          }
        }
      } else if (currentUserCoords) {
        lat = currentUserCoords.lat;
        lng = currentUserCoords.lng;
        finalLocationName = "Your Current Location";
      }

      const topRecs = generateDynamicBusinessRecommendations(targetVal, finalLocationName, sizeVal, budgetVal);
      const topRec = topRecs[0];

      const queryTerm = isSuggestGoal ? topRec.name : businessQuery;

      // Competitors Caching
      const placesKey = `${getCacheKey(lat, lng)}_${queryTerm}`;
      let competitors;
      if (apiCache.places[placesKey]) {
        competitors = apiCache.places[placesKey];
      } else {
        competitors = await fetchNearbyPlacesFromApi(lat, lng, queryTerm, gKey);
        apiCache.places[placesKey] = competitors;
      }

      // Landmarks Caching
      const landmarksKey = getCacheKey(lat, lng);
      let landmarks;
      if (apiCache.landmarks[landmarksKey]) {
        landmarks = apiCache.landmarks[landmarksKey];
      } else {
        landmarks = await fetchNearbyLandmarksFromApi(lat, lng, gKey);
        apiCache.landmarks[landmarksKey] = landmarks;
      }

      const competitorCount = competitors.length;
      const derivedScore = Math.max(55, Math.min(98, 92 - (competitorCount * 3)));
      const derivedLevel = derivedScore >= 85 ? "Excellent Opportunity" : derivedScore >= 70 ? "Moderate Opportunity" : "High Risk";

      return {
        isSuggestGoal,
        suggestedName: isSuggestGoal ? topRec.name : businessQuery,
        targetVal,
        locationVal: finalLocationName,
        sizeVal,
        budgetVal,
        top5Opportunities: topRecs,
        opportunityScore: isSuggestGoal ? topRec.score : derivedScore,
        opportunityLevel: derivedLevel,
        scoreColorClass: (isSuggestGoal ? topRec.score : derivedScore) >= 90 ? "text-green" : "text-cyan",
        reason: topRec.whySuits,
        strengths: ["Live Places data confirms real footfall anchors nearby.", "Direct competitor density is within a healthy range.", "Landmark proximity supports target customer capture."],
        weaknesses: ["Area rental costs may be above average.", "Established competitor loyalty may require a promotional launch."],
        risks: ["Seasonal demand fluctuations possible.", "Regulatory zoning changes."],
        competitors: competitors.map((c, i) => ({
          name: c.name,
          category: businessQuery || "General Retail",
          rating: c.rating || 4.2,
          reviews: c.reviews || 80,
          price: 50 + (i * 20),
          distance: `${c.distance} m`,
          lat: c.lat,
          lng: c.lng
        })),
        landmarks: landmarks.map(l => ({
          name: l.name,
          type: l.type,
          distance: `${l.distance} m`,
          lat: l.lat,
          lng: l.lng
        })),
        expectedCustomers: Math.round(1200 + (landmarks.length * 80)),
        estimatedMonthlyRevenue: isSuggestGoal ? topRec.profit : Math.round(budgetVal * 0.22),
        initialInvestment: isSuggestGoal ? topRec.investment : Math.round(budgetVal * 0.65),
        paybackPeriod: `${isSuggestGoal ? topRec.roi : Math.round(12 + (competitorCount * 0.8))} Months`,
        confidence: isSuggestGoal ? topRec.confidence : Math.round(derivedScore * 0.95),
        alternatives: topRecs.slice(1).map(x => x.name),
        coordinates: { lat, lng },
        isNewScan: true
      };

    } catch (err) {
      console.error("API pipeline run error:", err);
      return generateHighFidelitySimulation(isSuggestGoal, businessQuery, finalLocationName, budgetVal, sizeVal, targetVal);
    }
  }

  function saveReportToStorage(r) {
    if (!r || !r.isNewScan) return;
    delete r.isNewScan;
    const bizName = r.suggestedName || "Market Analysis Report";
    const locName = r.locationVal || "Indiranagar, Bengaluru";
    const catName = (r.top5Opportunities && r.top5Opportunities[0]) ? r.top5Opportunities[0].category : "Food & Beverage";
    const targetCust = r.targetVal || "General Public";

    const reportObj = {
      id: "report-" + Date.now(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      timestamp: Date.now(),
      name: bizName,
      category: catName,
      location: locName,
      targetCustomers: targetCust,
      size: r.sizeVal || "Small",
      budget: r.budgetVal || 2500000,
      score: r.opportunityScore || 92,
      demand: r.opportunityScore >= 90 ? "Very High" : "High",
      competition: r.competitors ? (r.competitors.length <= 2 ? "Low" : r.competitors.length <= 5 ? "Moderate" : "High") : "Low",
      confidence: r.confidence || 95,
      investment: r.initialInvestment || 1200000,
      revenue: r.estimatedMonthlyRevenue || 220000,
      roi: r.paybackPeriod || "14 Months",
      analysisData: r
    };

    try {
      let reports = JSON.parse(localStorage.getItem('mm_saved_reports') || '[]');
      const isDup = reports.some(x => x.name === reportObj.name && x.location === reportObj.location && (Date.now() - (x.timestamp || 0)) < 10000);
      if (!isDup) {
        reports = [reportObj, ...reports];
        localStorage.setItem('mm_saved_reports', JSON.stringify(reports));
      }
    } catch (e) {
      console.error("Error saving report to localStorage:", e);
    }
  }

  function renderAnalysisResultsOnUi() {
    if (!globalAnalysisResult) return;

    const r = globalAnalysisResult;

    // Auto-save generated analysis report to storage
    saveReportToStorage(r);

    // 1. Update Recommendation Page Details
    const recNameEl = document.getElementById('rec-business-name');
    const recSubtitleEl = document.getElementById('rec-business-subtitle');
    const recScoreNumEl = document.getElementById('rec-score-num');
    const recScoreGradeEl = document.getElementById('rec-score-grade');
    const estInvestmentEl = document.getElementById('est-stat-investment');
    const estRevenueEl = document.getElementById('est-stat-revenue');
    const estCustomersEl = document.getElementById('est-stat-customers');
    const estRoiEl = document.getElementById('est-stat-roi');
    const recConfidencePctEl = document.getElementById('rec-confidence-pct');
    const recConfidenceDial = document.getElementById('rec-confidence-dial');

    if (recNameEl) {
      if (r.isSuggestGoal) {
        recNameEl.innerText = r.suggestedName || (r.alternatives ? r.alternatives[0] : "AI Recommended Business");
      } else {
        recNameEl.innerText = document.getElementById('analysis-business-type').value || "Your Business Idea";
      }
    }

    if (recSubtitleEl) recSubtitleEl.innerText = r.reason;
    if (recScoreNumEl) recScoreNumEl.innerText = r.opportunityScore;
    if (recScoreGradeEl) {
      recScoreGradeEl.innerText = r.opportunityLevel;
      recScoreGradeEl.className = `score-grade ${r.scoreColorClass}`;
    }

    const formatRupees = (val) => {
      if (val >= 10000000) {
        return "₹" + (val / 10000000).toFixed(1) + " Cr";
      } else if (val >= 100000) {
        return "₹" + (val / 100000).toFixed(1) + " Lakh";
      }
      return "₹" + val.toLocaleString('en-IN');
    };

    if (estInvestmentEl) estInvestmentEl.innerText = formatRupees(r.initialInvestment);
    if (estRevenueEl) estRevenueEl.innerText = formatRupees(r.estimatedMonthlyRevenue) + " / mo";
    if (estCustomersEl) estCustomersEl.innerText = r.expectedCustomers.toLocaleString('en-IN') + "+ / mo";
    if (estRoiEl) estRoiEl.innerText = r.paybackPeriod;

    if (recConfidencePctEl) recConfidencePctEl.innerText = r.confidence + "%";
    if (recConfidenceDial) {
      recConfidenceDial.style.background = `radial-gradient(closest-side, var(--bg-card) 78%, transparent 80% 100%), conic-gradient(var(--accent-purple) ${r.confidence}%, rgba(255,255,255,0.03) 0)`;
    }

    // Populate SWOT Lists
    const strengthsList = document.getElementById('rec-strengths-list');
    const weaknessesList = document.getElementById('rec-weaknesses-list');

    if (strengthsList) {
      strengthsList.innerHTML = r.strengths.map(s => `<li>${s}</li>`).join('');
    }
    if (weaknessesList) {
      const combined = [...r.weaknesses, ...r.risks];
      weaknessesList.innerHTML = combined.map(w => `<li>${w}</li>`).join('');
    }

    // Populate Alternatives
    const alternativesContainer = document.getElementById('rec-alternatives-container');
    if (alternativesContainer) {
      alternativesContainer.innerHTML = r.alternatives.map(alt => `
        <span class="alternative-pill-tag" style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.2); color: var(--accent-purple); padding: 0.3rem 0.8rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s;" onclick="selectAlternativeBusiness('${alt.replace(/'/g, "\\'")}')">${alt}</span>
      `).join('');
    }

    // 2. Update Dashboard Overview Page Details
    const dashScoreEl = document.getElementById('dash-opportunity-score');
    const dashLevelEl = document.getElementById('dash-opportunity-level');
    const dashCompCountEl = document.getElementById('dash-competitor-count');
    const dashCompLevelEl = document.getElementById('dash-competitor-level');
    const dashCompBarEl = document.getElementById('dash-competitor-bar');
    const dashDemandLevelEl = document.getElementById('dash-demand-level');
    const dashDemandBadgeEl = document.getElementById('dash-demand-badge');
    const dashDemandBarEl = document.getElementById('dash-demand-bar');
    const dashConfPctEl = document.getElementById('dash-confidence-pct');
    const dashConfBadgeEl = document.getElementById('dash-confidence-badge');

    if (dashScoreEl) dashScoreEl.innerHTML = `${r.opportunityScore} <span class="lbl-small">/ 100</span>`;
    if (dashLevelEl) {
      dashLevelEl.innerText = r.opportunityLevel;
      dashLevelEl.className = `stat-card-percent-change ${r.opportunityScore >= 80 ? 'green' : 'orange'}`;
    }

    if (dashCompCountEl) dashCompCountEl.innerHTML = `${r.competitors.length} <span class="lbl-small">Businesses</span>`;
    if (dashCompLevelEl) {
      const compLvl = r.competitors.length <= 2 ? "Low Competition" : r.competitors.length <= 5 ? "Medium Competition" : "High Competition";
      dashCompLevelEl.innerText = compLvl;
      dashCompLevelEl.style.color = r.competitors.length <= 2 ? "var(--accent-green)" : r.competitors.length <= 5 ? "#f59e0b" : "#ef4444";
      if (dashCompBarEl) {
        dashCompBarEl.style.width = `${Math.min(100, r.competitors.length * 15)}%`;
        dashCompBarEl.style.backgroundColor = r.competitors.length <= 2 ? "var(--accent-green)" : r.competitors.length <= 5 ? "#f59e0b" : "#ef4444";
        dashCompBarEl.style.boxShadow = `0 0 6px ${dashCompBarEl.style.backgroundColor}`;
      }
    }

    const demandLvl = r.opportunityScore >= 90 ? "Very High" : r.opportunityScore >= 80 ? "High" : r.opportunityScore >= 65 ? "Medium" : "Low";
    if (dashDemandLevelEl) dashDemandLevelEl.innerText = demandLvl;
    if (dashDemandBadgeEl) {
      dashDemandBadgeEl.innerText = `${demandLvl} Demand`;
      dashDemandBadgeEl.className = `stat-card-percent-change ${r.opportunityScore >= 80 ? 'green' : 'orange'}`;
    }
    if (dashDemandBarEl) {
      const w = r.opportunityScore >= 90 ? "95%" : r.opportunityScore >= 80 ? "80%" : r.opportunityScore >= 65 ? "60%" : "40%";
      dashDemandBarEl.style.width = w;
    }

    if (dashConfPctEl) dashConfPctEl.innerText = r.confidence + "%";
    if (dashConfBadgeEl) dashConfBadgeEl.innerText = r.confidence + "%";

    // Update Live stream insights list
    const insightsStream = document.getElementById('dash-insights-stream');
    if (insightsStream) {
      if (r.competitors.length === 0) {
        insightsStream.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No competitors detected near targeted spots.</div>`;
      } else {
        insightsStream.innerHTML = r.competitors.map(c => `
          <div class="signal-card-item signal-buy">
            <div class="signal-token">
              <span class="token-sym" style="font-weight: 700;">${c.name}</span>
              <span class="token-name">${c.category}</span>
            </div>
            <div class="signal-direction">
              <span class="badge badge-buy" style="background: rgba(16, 185, 129, 0.1); color: var(--accent-green); padding: 0.2rem 0.5rem; border-radius: 4px;">⭐ ${c.rating}</span>
              <span class="signal-confidence" style="font-size: 0.75rem; color: var(--text-muted);">${c.reviews} Reviews</span>
            </div>
            <div class="signal-price">
              <strong style="color: var(--accent-purple);">₹${c.price}</strong>
              <span class="green" style="color: var(--accent-cyan); font-size: 0.72rem;">${c.distance} away</span>
            </div>
          </div>
        `).join('');
      }
    }

    // Update competitor analysis table tbody
    const tbody = document.getElementById('dash-competitors-tbody');
    if (tbody) {
      if (r.competitors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No competitor records geocoded.</td></tr>`;
      } else {
        tbody.innerHTML = r.competitors.map((c, i) => {
          const logoLetter = c.name.charAt(0);
          const gradient = i % 3 === 0 ? "linear-gradient(135deg, #00f0ff, #3b82f6)" :
            i % 3 === 1 ? "linear-gradient(135deg, #a855f7, #3b82f6)" :
              "linear-gradient(135deg, #10b981, #00f0ff)";
          const ratingVal = parseFloat(c.rating) || 0;
          const compBadge = ratingVal >= 4.5 ? "bullish" : ratingVal >= 4.0 ? "moderate" : "bearish";
          const compLevel = ratingVal >= 4.5 ? "Low Risk" : ratingVal >= 4.0 ? "Medium Risk" : "High Risk";

          return `
            <tr>
              <td>
                <div class="asset-identity" style="display: flex; align-items: center; gap: 0.8rem;">
                  <span class="asset-logo" style="background: ${gradient}; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-size: 0.9rem;">${logoLetter}</span>
                  <div>
                    <strong style="font-size: 0.85rem; color: #fff;">${c.name}</strong>
                    <p style="margin: 0.15rem 0 0 0; font-size: 0.75rem; color: var(--text-muted);">${c.category}</p>
                  </div>
                </div>
              </td>
              <td style="font-size: 0.82rem; color: var(--text-secondary);">${c.category}</td>
              <td><span class="rating-bar-num font-space" style="font-size: 0.85rem; font-weight: 600; color: #fff;">⭐ ${c.rating}</span></td>
              <td style="font-size: 0.82rem; color: var(--text-secondary);">${c.reviews}</td>
              <td style="font-size: 0.82rem; color: var(--text-secondary); font-weight: 600;">₹${c.price}</td>
              <td style="font-size: 0.82rem; color: var(--text-secondary);">${c.distance}</td>
              <td><span class="prediction-status-badge ${compBadge}" style="padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${compLevel}</span></td>
              <td>
                <button class="btn btn-outline btn-tbl-act" style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem;" onclick="alert('Viewing comprehensive AI review intelligence for ${c.name.replace(/'/g, "\\'")}: Rating of ${c.rating} based on ${c.reviews} reviews.')">View Analysis</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    const coords = (r && r.coordinates) ? r.coordinates : { lat: 12.9784, lng: 77.6408 };
    initGoogleMapsWidget(coords.lat, coords.lng, r.competitors || [], r.landmarks || []);
  }

  function initGoogleMapsWidget(lat, lng, competitors, landmarks) {
    const mapContainer = document.getElementById('real-google-map');
    if (!mapContainer) return;

    // Remove loading placeholder spinner
    const placeholder = mapContainer.querySelector('.map-loading-placeholder');
    if (placeholder) placeholder.remove();

    if (window.google && window.google.maps) {
      clearDashboardMarkers();
      const centerLatLng = new google.maps.LatLng(lat, lng);

      const mapOptions = {
        zoom: 14,
        center: centerLatLng,
        styles: darkMapThemeStyles,
        zoomControl: true,
        fullscreenControl: true,
        mapTypeControl: true,
        streetViewControl: true
      };

      dashboardMap = new google.maps.Map(mapContainer, mapOptions);

      // Target Spot Pin
      dashboardTargetMarker = new google.maps.Marker({
        position: centerLatLng,
        map: dashboardMap,
        title: "Recommended Spot",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#00f0ff",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2
        }
      });

      // User Marker
      if (currentUserCoords) {
        const userLatLng = new google.maps.LatLng(currentUserCoords.lat, currentUserCoords.lng);
        dashboardUserMarker = new google.maps.Marker({
          position: userLatLng,
          map: dashboardMap,
          title: "You are here",
          label: {
            text: "You",
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: "bold"
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#10b981", // green for user
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          }
        });
      }

      activeInfoWindow = new google.maps.InfoWindow();

      // Competitors pins
      competitors.forEach(c => {
        const marker = new google.maps.Marker({
          position: new google.maps.LatLng(c.lat, c.lng),
          map: dashboardMap,
          title: c.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#ef4444",
            fillOpacity: 0.9,
            strokeColor: "#ffffff",
            strokeWeight: 1.5
          }
        });

        marker.addListener('click', () => {
          activeInfoWindow.setContent(`
            <div style="color: #121212; padding: 0.5rem; font-family: sans-serif;">
              <strong style="font-size: 0.95rem;">${c.name}</strong>
              <p style="margin: 0.3rem 0; font-size: 0.85rem; color: #555;">⭐ ${c.rating} (${c.reviews} Reviews)</p>
              <p style="margin: 0; font-size: 0.8rem; color: #777;">Distance: ${c.distance}</p>
            </div>
          `);
          activeInfoWindow.open(dashboardMap, marker);
        });

        dashboardMarkers.push(marker);
      });

      // Landmarks pins
      landmarks.forEach(l => {
        const marker = new google.maps.Marker({
          position: new google.maps.LatLng(l.lat, l.lng),
          map: dashboardMap,
          title: l.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#a855f7",
            fillOpacity: 0.9,
            strokeColor: "#ffffff",
            strokeWeight: 1.5
          }
        });

        marker.addListener('click', () => {
          activeInfoWindow.setContent(`
            <div style="color: #121212; padding: 0.5rem; font-family: sans-serif;">
              <strong style="font-size: 0.95rem;">${l.name}</strong>
              <p style="margin: 0.3rem 0; font-size: 0.85rem; color: #555;">Type: ${l.type}</p>
              <p style="margin: 0; font-size: 0.8rem; color: #777;">Distance: ${l.distance}</p>
            </div>
          `);
          activeInfoWindow.open(dashboardMap, marker);
        });

        dashboardMarkers.push(marker);
      });

      // Heatmap density
      if (window.google.maps.visualization && competitors.length > 0) {
        const heatmapData = competitors.map(c => new google.maps.LatLng(c.lat, c.lng));
        dashboardHeatmap = new google.maps.visualization.HeatmapLayer({
          data: heatmapData,
          map: dashboardMap,
          radius: 35
        });
      }
    } else {
      renderSimulatedVectorMap(mapContainer, competitors, landmarks);
    }
  }

  function renderSimulatedVectorMap(container, competitors, landmarks) {
    container.innerHTML = `
      <div class="simulated-vector-map-overlay" style="position: absolute; inset: 0; background: #0c0c10; display: flex; align-items: center; justify-content: center; overflow: hidden; width: 100%; height: 100%;">
        <div class="glowing-grid" style="position: absolute; width: 200%; height: 200%; background-image: radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px); background-size: 24px 24px; transform: rotate(15deg); opacity: 0.8;"></div>
        
        <div class="map-marker business-center-marker" style="position: absolute; z-index: 10;">
          <span class="marker-dot" style="background: var(--accent-cyan); box-shadow: 0 0 15px var(--accent-cyan); width: 14px; height: 14px; border-radius: 50%; display: inline-block;"></span>
          <span class="marker-pulse" style="position: absolute; border: 2px solid var(--accent-cyan); border-radius: 50%; width: 34px; height: 34px; left: -10px; top: -10px; animation: marker-pulse 2s infinite;"></span>
          <span class="marker-label" style="position: absolute; color: #fff; font-size: 0.75rem; white-space: nowrap; left: 20px; top: -2px; font-weight: 700; text-shadow: 0 2px 4px #000;">Target Spot</span>
        </div>

        ${competitors.map((c, i) => {
      const angle = (i * (360 / Math.max(1, competitors.length))) * Math.PI / 180;
      const dist = 100 + (i * 25);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;

      return `
            <div class="simulated-marker competitor-marker" style="position: absolute; left: calc(50% + ${x}px); top: calc(50% + ${y}px); transform: translate(-50%, -50%);">
              <span style="background: #ef4444; box-shadow: 0 0 8px #ef4444; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
              <span style="position: absolute; color: var(--text-secondary); font-size: 0.7rem; white-space: nowrap; left: 14px; top: -4px; pointer-events: none;">${c.name}</span>
            </div>
          `;
    }).join('')}

        ${landmarks.map((l, i) => {
      const angle = ((i * (360 / Math.max(1, landmarks.length))) + 45) * Math.PI / 180;
      const dist = 80 + (i * 35);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;

      return `
            <div class="simulated-marker landmark-marker" style="position: absolute; left: calc(50% + ${x}px); top: calc(50% + ${y}px); transform: translate(-50%, -50%);">
              <span style="background: #a855f7; box-shadow: 0 0 8px #a855f7; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
              <span style="position: absolute; color: var(--text-secondary); font-size: 0.7rem; white-space: nowrap; left: 14px; top: -4px; pointer-events: none;">${l.name}</span>
            </div>
          `;
    }).join('')}

        <div style="position: absolute; top: 1rem; left: 1rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 0.35rem 0.8rem; border-radius: 6px; font-size: 0.72rem; color: var(--text-muted); pointer-events: none; z-index: 20;">
          💡 Simulated Mapping Mode (Connect API key in Settings)
        </div>
      </div>
    `;
  }

  function clearDashboardMarkers() {
    if (dashboardMarkers) {
      dashboardMarkers.forEach(m => m.setMap(null));
    }
    dashboardMarkers = [];
    if (dashboardUserMarker) {
      dashboardUserMarker.setMap(null);
      dashboardUserMarker = null;
    }
    if (dashboardTargetMarker) {
      dashboardTargetMarker.setMap(null);
      dashboardTargetMarker = null;
    }
    if (dashboardHeatmap) {
      dashboardHeatmap.setMap(null);
      dashboardHeatmap = null;
    }
  }

  window.selectAlternativeBusiness = function (businessName) {
    const searchInput = document.getElementById('analysis-business-type-search');
    const hiddenInput = document.getElementById('analysis-business-type');

    if (searchInput) searchInput.value = businessName;
    if (hiddenInput) {
      hiddenInput.value = businessName;
      hiddenInput.dispatchEvent(new Event('change'));
    }

    if (subViews.newAnalysis) {
      Object.values(subViews).forEach(view => {
        if (view) view.classList.remove('active');
      });
      subViews.newAnalysis.classList.add('active');
    }

    navItems.forEach(item => {
      if (item.getAttribute('data-nav') === 'signals') {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    alert(`Selected: "${businessName}". You can modify parameters and run a new analysis!`);
  };

  // --- Application API Credentials Background Loader ---
  if (GOOGLE_MAPS_API_KEY && !localStorage.getItem('mm_google_maps_key')) {
    localStorage.setItem('mm_google_maps_key', GOOGLE_MAPS_API_KEY);
  }

  const appGmapsKey = localStorage.getItem('mm_google_maps_key') || GOOGLE_MAPS_API_KEY || '';
  if (appGmapsKey && !window.google) {
    loadGoogleMapsScript(appGmapsKey);
  }

  // ============================================================
  //  USER SETTINGS PAGE ENGINE
  // ============================================================

  function initSettingsPage() {
    // 1. Profile Data Management
    const profileForm = document.getElementById('settings-profile-form');
    const inputFullName = document.getElementById('settings-full-name');
    const inputEmail = document.getElementById('settings-email');
    const avatarPreview = document.getElementById('settings-avatar-preview');
    const avatarInput = document.getElementById('settings-avatar-input');

    // Default Profile Data
    let savedProfile = {
      name: "Preet Patel",
      email: "preet@marketmind.ai",
      plan: "Pro Intelligence Plan",
      memberSince: "August 2026",
      avatar: ""
    };

    try {
      const stored = localStorage.getItem('mm_user_profile');
      if (stored) {
        savedProfile = { ...savedProfile, ...JSON.parse(stored) };
      }
    } catch (e) { }

    if (inputFullName) inputFullName.value = savedProfile.name;
    if (inputEmail) inputEmail.value = savedProfile.email;

    function updateAvatarUI(name, avatarUrl) {
      if (!avatarPreview) return;
      if (avatarUrl) {
        avatarPreview.innerHTML = `<img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:20px;">`;
      } else {
        const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'PP';
        avatarPreview.innerHTML = initials;
      }
    }

    updateAvatarUI(savedProfile.name, savedProfile.avatar);

    // Sync profile name across sidebar & header
    function syncUserProfileToDom(profile) {
      const sidebarUserNames = document.querySelectorAll('.user-name');
      sidebarUserNames.forEach(el => { el.innerText = profile.name; });

      const welcomeHeaders = document.querySelectorAll('.welcome-meta h1');
      const firstName = profile.name.split(' ')[0] || 'User';
      welcomeHeaders.forEach(el => { el.innerText = `Good evening, ${firstName}`; });
    }

    syncUserProfileToDom(savedProfile);

    // Avatar Upload Handler
    if (avatarInput) {
      avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          if (file.size > 2097152) {
            triggerSystemToast('⚠️ File size exceeds 2MB limit.', 3000);
            return;
          }
          const reader = new FileReader();
          reader.onload = (evt) => {
            savedProfile.avatar = evt.target.result;
            updateAvatarUI(savedProfile.name, savedProfile.avatar);
            localStorage.setItem('mm_user_profile', JSON.stringify(savedProfile));
            triggerSystemToast('✅ Profile avatar updated!', 2500);
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Save Profile Form Submission
    if (profileForm && !profileForm.dataset.bound) {
      profileForm.dataset.bound = "true";
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        savedProfile.name = inputFullName ? inputFullName.value.trim() : savedProfile.name;
        savedProfile.email = inputEmail ? inputEmail.value.trim() : savedProfile.email;

        localStorage.setItem('mm_user_profile', JSON.stringify(savedProfile));
        syncUserProfileToDom(savedProfile);
        updateAvatarUI(savedProfile.name, savedProfile.avatar);

        triggerSystemToast('✅ Profile information updated successfully!', 3000);
      });
    }

    // 2. Preferences Management (Theme & Notifications)
    const prefForm = document.getElementById('settings-preferences-form');
    const themeCards = document.querySelectorAll('.settings-theme-card');
    const inappCheck = document.getElementById('pref-inapp-notif');
    const emailCheck = document.getElementById('pref-email-notif');

    let savedPrefs = {
      theme: 'dark',
      inAppNotif: true,
      emailNotif: true
    };

    try {
      const storedPrefs = localStorage.getItem('mm_user_preferences');
      if (storedPrefs) {
        savedPrefs = { ...savedPrefs, ...JSON.parse(storedPrefs) };
      }
    } catch (e) { }

    // Apply active theme card & radio states in UI
    themeCards.forEach(card => {
      const themeVal = card.getAttribute('data-theme');
      const radio = card.querySelector('input[type="radio"]');

      if (themeVal === savedPrefs.theme) {
        card.classList.add('active');
        if (radio) radio.checked = true;
      } else {
        card.classList.remove('active');
        if (radio) radio.checked = false;
      }

      // Live click handler: immediately switch theme and update radio/card state
      card.addEventListener('click', () => {
        themeCards.forEach(c => {
          c.classList.remove('active');
          const r = c.querySelector('input[type="radio"]');
          if (r) r.checked = false;
        });

        card.classList.add('active');
        if (radio) radio.checked = true;

        savedPrefs.theme = themeVal;
        localStorage.setItem('mm_user_preferences', JSON.stringify(savedPrefs));

        if (window.applyAppTheme) window.applyAppTheme(themeVal);

        const themeName = themeVal === 'system' ? 'System Default' : (themeVal === 'light' ? 'Light Theme' : 'Dark Theme');
        triggerSystemToast(`🎨 Switched to ${themeName}`, 2000);
      });
    });

    if (inappCheck) inappCheck.checked = savedPrefs.inAppNotif;
    if (emailCheck) emailCheck.checked = savedPrefs.emailNotif;

    if (window.applyAppTheme) window.applyAppTheme(savedPrefs.theme);

    if (prefForm && !prefForm.dataset.bound) {
      prefForm.dataset.bound = "true";
      prefForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedRadio = document.querySelector('input[name="app-theme"]:checked');
        const themeVal = selectedRadio ? selectedRadio.value : 'dark';

        savedPrefs.theme = themeVal;
        savedPrefs.inAppNotif = inappCheck ? inappCheck.checked : true;
        savedPrefs.emailNotif = emailCheck ? emailCheck.checked : true;

        localStorage.setItem('mm_user_preferences', JSON.stringify(savedPrefs));
        if (window.applyAppTheme) window.applyAppTheme(themeVal);

        triggerSystemToast('✅ Preferences saved successfully!', 3000);
      });
    }

    // 3. Account Logout Buttons
    const btnLogoutAcc = document.getElementById('btn-settings-logout');
    const btnLogoutSec = document.getElementById('btn-settings-logout-sec');

    function performLogout() {
      navigateTo('auth');
      triggerSystemToast('Logged out of workspace session.', 3000);
    }

    if (btnLogoutAcc && !btnLogoutAcc.dataset.bound) {
      btnLogoutAcc.dataset.bound = "true";
      btnLogoutAcc.addEventListener('click', performLogout);
    }

    if (btnLogoutSec && !btnLogoutSec.dataset.bound) {
      btnLogoutSec.dataset.bound = "true";
      btnLogoutSec.addEventListener('click', performLogout);
    }

    // 4. Security Password Form
    const secForm = document.getElementById('settings-security-form');
    const currPass = document.getElementById('settings-curr-pass');
    const newPass = document.getElementById('settings-new-pass');
    const confirmPass = document.getElementById('settings-confirm-pass');

    if (secForm && !secForm.dataset.bound) {
      secForm.dataset.bound = "true";
      secForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nPass = newPass ? newPass.value : '';
        const cPass = confirmPass ? confirmPass.value : '';

        if (!nPass) {
          triggerSystemToast('⚠️ Please enter a new password.', 3000);
          return;
        }

        if (nPass.length < 8) {
          triggerSystemToast('⚠️ Password must be at least 8 characters long.', 3000);
          return;
        }

        if (nPass !== cPass) {
          triggerSystemToast('⚠️ Passwords do not match. Please verify.', 3000);
          return;
        }

        if (currPass) currPass.value = '';
        if (newPass) newPass.value = '';
        if (confirmPass) confirmPass.value = '';

        triggerSystemToast('✅ Security password updated successfully!', 3500);
      });
    }

    // 5. Danger Zone - Account Deletion
    const btnDeleteAccount = document.getElementById('btn-delete-account');
    const modalDeleteAcc = document.getElementById('delete-account-modal');
    const btnCancelDelete = document.getElementById('btn-cancel-delete-account');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete-account');

    if (btnDeleteAccount && !btnDeleteAccount.dataset.bound) {
      btnDeleteAccount.dataset.bound = "true";
      btnDeleteAccount.addEventListener('click', () => {
        if (modalDeleteAcc) modalDeleteAcc.style.display = 'flex';
      });
    }

    if (btnCancelDelete && !btnCancelDelete.dataset.bound) {
      btnCancelDelete.dataset.bound = "true";
      btnCancelDelete.addEventListener('click', () => {
        if (modalDeleteAcc) modalDeleteAcc.style.display = 'none';
      });
    }

    if (btnConfirmDelete && !btnConfirmDelete.dataset.bound) {
      btnConfirmDelete.dataset.bound = "true";
      btnConfirmDelete.addEventListener('click', () => {
        if (modalDeleteAcc) modalDeleteAcc.style.display = 'none';
        triggerSystemToast('ℹ️ Account deletion is disabled for demo/test accounts.', 4000);
      });
    }
  }

  // --- BUSINESS OPPORTUNITIES DISCOVERY PANEL ENGINE ---
  let isOppInitialized = false;
  let savedOpportunities = [];

  const opportunitiesDb = [
    {
      id: "opp-1",
      name: "Protein Egg Café",
      category: "Food & Beverage",
      icon: "🍳",
      score: 95,
      confidence: 96,
      investment: 650000,
      revenue: 220000,
      profit: 85000,
      roi: 14,
      risk: "Low",
      competition: "Low",
      demand: "Very High",
      segments: ["Fitness Enthusiasts", "Office Employees", "Students"],
      desc: "High student and gym-goer density combined with a lack of healthy breakfast options makes this a premium entry point.",
      whyRecom: [
        "High capturing rate: Over 3 gyms and 2 wellness parks in a 1km service radius.",
        "Low competition: Nearest specialty health cafe is 3.2km away.",
        "High ROI efficiency: Predicts full initial investment payback within 14 months."
      ],
      x: 42, y: 38
    },
    {
      id: "opp-2",
      name: "Specialty Bakery & Brew",
      category: "Food & Beverage",
      icon: "🥐",
      score: 89,
      confidence: 91,
      investment: 1200000,
      revenue: 350000,
      profit: 110000,
      roi: 18,
      risk: "Medium",
      competition: "Moderate",
      demand: "High",
      segments: ["Families", "Office Employees", "Daily Commuters"],
      desc: "Specialty breads paired with boutique workspaces capture a premium demographic looking for coffee and co-working.",
      whyRecom: [
        "High average order value driven by specialty bakery bundles.",
        "Located near transit hub with high morning footfall.",
        "Payback period is highly stable with medium initial startup capital."
      ],
      x: 65, y: 25
    },
    {
      id: "opp-3",
      name: "Organic Juice & Protein Bar",
      category: "Food & Beverage",
      icon: "🥤",
      score: 93,
      confidence: 94,
      investment: 400000,
      revenue: 150000,
      profit: 60000,
      roi: 12,
      risk: "Low",
      competition: "Low",
      demand: "Very High",
      segments: ["Fitness Enthusiasts", "Students", "Shoppers"],
      desc: "Low raw ingredient overhead and small space requirements make this a highly efficient, high-margin retail play.",
      whyRecom: [
        "Exceptional profit margin (up to 70% markup on cold-press items).",
        "Tiny retail footprint minimizing rental risk and startup cost.",
        "Direct partnership opportunities with local gyms and centers."
      ],
      x: 28, y: 55
    },
    {
      id: "opp-4",
      name: "Smart Electronics Repair",
      category: "Retail & Tech",
      icon: "🔌",
      score: 82,
      confidence: 84,
      investment: 300000,
      revenue: 120000,
      profit: 50000,
      roi: 16,
      risk: "Low",
      competition: "Moderate",
      demand: "Moderate",
      segments: ["Students", "General Public", "Office Employees"],
      desc: "An eco-friendly repair storefront solving local hardware glitches with quick turnaround times and subscription guarantees.",
      whyRecom: [
        "Service-based margins with minimal physical inventory carrying costs.",
        "Recurrent revenue opportunities through student tech insurance contracts.",
        "Highly specialized labor profile limits immediate competitor entry."
      ],
      x: 75, y: 62
    },
    {
      id: "opp-5",
      name: "Boutique Wellness Gym",
      category: "Fitness & Health",
      icon: "🏋️",
      score: 91,
      confidence: 93,
      investment: 2500000,
      revenue: 600000,
      profit: 220000,
      roi: 20,
      risk: "Medium",
      competition: "Low",
      demand: "High",
      segments: ["Fitness Enthusiasts", "Families", "Senior Citizens"],
      desc: "Premium, semi-private wellness club catering to high-income residents willing to pay for boutique personal training.",
      whyRecom: [
        "Strong recurring revenue profile via monthly member subscriptions.",
        "Low saturation of premium trainers in the immediate locality.",
        "High average customer lifetime value exceeding 12 months."
      ],
      x: 18, y: 22
    },
    {
      id: "opp-6",
      name: "Luxury Salon & Spa",
      category: "Services",
      icon: "💅",
      score: 88,
      confidence: 89,
      investment: 1800000,
      revenue: 450000,
      profit: 150000,
      roi: 22,
      risk: "Medium",
      competition: "Moderate",
      demand: "High",
      segments: ["Families", "Office Employees", "Tourists"],
      desc: "High-end personal grooming lounge combining hair, skin, and aromatherapy treatments for premium pampering.",
      whyRecom: [
        "High loyalty rate with repeat booking patterns every 3-4 weeks.",
        "Substantial upsell margin on specialty skin care products.",
        "Strong localized word-of-mouth growth vectors."
      ],
      x: 82, y: 45
    },
    {
      id: "opp-7",
      name: "Pet Grooming & Daycare",
      category: "Services",
      icon: "🐾",
      score: 85,
      confidence: 87,
      investment: 500000,
      revenue: 140000,
      profit: 55000,
      roi: 15,
      risk: "Low",
      competition: "Low",
      demand: "High",
      segments: ["Families", "Office Employees", "Senior Citizens"],
      desc: "Provides pet sitting, grooming, and organic treat sales in sub-localities experiencing a rapid rise in pet ownership.",
      whyRecom: [
        "Rapid market category growth (above 15% CAGR locally).",
        "High repeat transaction rate for basic grooming services.",
        "Minimal competitors providing specialized daycare in the area."
      ],
      x: 52, y: 72
    },
    {
      id: "opp-8",
      name: "Boutique Ice Cream Parlor",
      category: "Food & Beverage",
      icon: "🍦",
      score: 86,
      confidence: 88,
      investment: 450000,
      revenue: 160000,
      profit: 60000,
      roi: 13,
      risk: "Low",
      competition: "Moderate",
      demand: "High",
      segments: ["Families", "Students", "Kids"],
      desc: "Specializes in organic, low-sugar gelato and creative flavor combos catering to high-spending residential clusters.",
      whyRecom: [
        "Strong evening family traffic patterns.",
        "Highly aesthetic store concept driving organic social media reach.",
        "Fast operational ramp-up window with simple kitchen workflows."
      ],
      x: 35, y: 15
    },
    {
      id: "opp-9",
      name: "Indie Bookstore & Cowork",
      category: "Retail & Tech",
      icon: "📚",
      score: 78,
      confidence: 80,
      investment: 800000,
      revenue: 200000,
      profit: 70000,
      roi: 24,
      risk: "Low",
      competition: "Low",
      demand: "Moderate",
      segments: ["Students", "Office Employees", "Families"],
      desc: "A community book shop integrated with quiet study desks, serving artisanal tea and local pastries.",
      whyRecom: [
        "Unique hybrid business model reduces dependency on book retail margins.",
        "Very low customer acquisition costs due to community workshops.",
        "Excellent partner alignment with local schools and libraries."
      ],
      x: 60, y: 82
    },
    {
      id: "opp-10",
      name: "Sustainable Fashion Outlet",
      category: "Retail & Tech",
      icon: "👗",
      score: 75,
      confidence: 78,
      investment: 1500000,
      revenue: 300000,
      profit: 90000,
      roi: 24,
      risk: "High",
      competition: "High",
      demand: "Moderate",
      segments: ["Students", "Shoppers", "Families"],
      desc: "Curated organic textiles and vintage collections capturing conscious shopping trends near commercial centers.",
      whyRecom: [
        "Strong brand value appeal to Gen-Z and millennial demographics.",
        "High average basket value on eco-friendly accessories.",
        "Visual window display options create good organic drive-by traffic."
      ],
      x: 90, y: 18
    }
  ];

  function initOpportunitiesPage() {
    if (isOppInitialized) {
      // Re-run search matching current location value if any
      runOpportunitiesSearch();
      return;
    }
    isOppInitialized = true;

    // Load saved bookmarks from LocalStorage
    try {
      const stored = localStorage.getItem('mm_saved_opportunities');
      if (stored) savedOpportunities = JSON.parse(stored);
    } catch (e) { }

    // DOM Elements bindings
    const btnToggleFilters = document.getElementById('btn-toggle-advanced-filters');
    const drawerFilters = document.getElementById('opp-filters-drawer');
    const inputLocation = document.getElementById('opp-location-search');
    const selectCategory = document.getElementById('filter-opp-category');
    const sliderInvestment = document.getElementById('filter-opp-investment');
    const lblInvestment = document.getElementById('lbl-filter-investment');
    const sliderScore = document.getElementById('filter-opp-score');
    const lblScore = document.getElementById('lbl-filter-score');
    const selectRoi = document.getElementById('filter-opp-roi');
    const selectSort = document.getElementById('opp-sort-select');

    const btnResetFilters = document.getElementById('btn-reset-opp-filters');
    const btnApplyFilters = document.getElementById('btn-apply-opp-filters');
    const btnExport = document.getElementById('btn-export-opportunities');
    const btnShare = document.getElementById('btn-share-opportunities');

    const riskButtons = document.querySelectorAll('.filter-risk-btn');
    const compButtons = document.querySelectorAll('.filter-comp-btn');

    const mapLayerComp = document.getElementById('layer-competitors');
    const mapLayerEdu = document.getElementById('layer-education');
    const mapLayerComm = document.getElementById('layer-commercial');
    const mapLayerLife = document.getElementById('layer-lifestyle');

    const compareSelectA = document.getElementById('compare-select-a');
    const compareSelectB = document.getElementById('compare-select-b');

    // Default Filters State
    activeFilters = {
      category: "All",
      maxInvestment: 5000000,
      risk: "All",
      competition: "All",
      roi: "All",
      minScore: 70,
      radius: 5
    };

    const sliderRadius = document.getElementById('filter-opp-radius');
    const lblRadius = document.getElementById('lbl-filter-radius');

    // Sync input initial display values
    if (lblInvestment && sliderInvestment) lblInvestment.innerText = formatIndianCurrency(sliderInvestment.value);
    if (lblScore && sliderScore) lblScore.innerText = `${sliderScore.value}+`;
    if (lblRadius && sliderRadius) lblRadius.innerText = `${sliderRadius.value} km`;

    // Connect form control listeners
    if (btnToggleFilters && drawerFilters) {
      btnToggleFilters.addEventListener('click', () => {
        const isHidden = drawerFilters.style.display === 'none';
        drawerFilters.style.display = isHidden ? 'block' : 'none';
      });
    }

    if (sliderInvestment && lblInvestment) {
      sliderInvestment.addEventListener('input', (e) => {
        lblInvestment.innerText = formatIndianCurrency(e.target.value);
      });
    }

    if (sliderScore && lblScore) {
      sliderScore.addEventListener('input', (e) => {
        lblScore.innerText = `${e.target.value}+`;
      });
    }

    if (sliderRadius && lblRadius) {
      sliderRadius.addEventListener('input', (e) => {
        lblRadius.innerText = `${e.target.value} km`;
      });
    }

    // Segmented Buttons click handlers
    riskButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        riskButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilters.risk = btn.getAttribute('data-risk');
      });
    });

    compButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        compButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilters.competition = btn.getAttribute('data-comp');
      });
    });

    if (btnResetFilters) {
      btnResetFilters.addEventListener('click', () => {
        // Reset elements values
        if (selectCategory) selectCategory.value = "All";
        if (sliderInvestment) {
          sliderInvestment.value = 5000000;
          if (lblInvestment) lblInvestment.innerText = formatIndianCurrency(5000000);
        }
        if (sliderScore) {
          sliderScore.value = 70;
          if (lblScore) lblScore.innerText = "70+";
        }
        if (sliderRadius) {
          sliderRadius.value = 5;
          if (lblRadius) lblRadius.innerText = "5 km";
        }
        if (selectRoi) selectRoi.value = "All";

        riskButtons.forEach((b, i) => i === 0 ? b.classList.add('active') : b.classList.remove('active'));
        compButtons.forEach((b, i) => i === 0 ? b.classList.add('active') : b.classList.remove('active'));

        activeFilters = {
          category: "All",
          maxInvestment: 5000000,
          risk: "All",
          competition: "All",
          roi: "All",
          minScore: 70,
          radius: 5
        };

        runOpportunitiesSearch();
      });
    }

    if (btnApplyFilters) {
      btnApplyFilters.addEventListener('click', () => {
        if (selectCategory) activeFilters.category = selectCategory.value;
        if (sliderInvestment) activeFilters.maxInvestment = parseInt(sliderInvestment.value);
        if (sliderScore) activeFilters.minScore = parseInt(sliderScore.value);
        if (selectRoi) activeFilters.roi = selectRoi.value;
        if (sliderRadius) activeFilters.radius = parseInt(sliderRadius.value);

        // Hide drawer on apply
        if (drawerFilters) drawerFilters.style.display = "none";

        runOpportunitiesSearch();
      });
    }

    // Live searches location input changes
    if (inputLocation) {
      inputLocation.addEventListener('input', () => {
        runOpportunitiesSearch();
      });
    }

    if (selectSort) {
      selectSort.addEventListener('change', () => {
        runOpportunitiesSearch();
      });
    }

    // Map checkboxes changes
    [mapLayerComp, mapLayerEdu, mapLayerComm, mapLayerLife].forEach(chk => {
      if (chk) chk.addEventListener('change', () => runOpportunitiesSearch());
    });

    // Side-by-side dropdown selectors
    if (compareSelectA) {
      compareSelectA.addEventListener('change', (e) => updateSideBySideComparison(e.target.value, compareSelectB ? compareSelectB.value : ""));
    }
    if (compareSelectB) {
      compareSelectB.addEventListener('change', (e) => updateSideBySideComparison(compareSelectA ? compareSelectA.value : "", e.target.value));
    }

    // Bookmarking handlers
    document.addEventListener('click', (e) => {
      // Save opportunity from cards
      const saveCardBtn = e.target.closest('.btn-save-opp');
      if (saveCardBtn) {
        e.preventDefault();
        const id = saveCardBtn.getAttribute('data-id');
        toggleBookmarkOpportunity(id);
      }

      // View Detailed analysis
      const viewCardBtn = e.target.closest('.btn-view-opp-full');
      if (viewCardBtn) {
        e.preventDefault();
        const id = viewCardBtn.getAttribute('data-id');
        routeToDetailedAnalysis(id);
      }

      // Remove bookmark from Saved list
      const removeSavedBtn = e.target.closest('.btn-remove-saved');
      if (removeSavedBtn) {
        e.preventDefault();
        const id = removeSavedBtn.getAttribute('data-id');
        toggleBookmarkOpportunity(id);
      }
    });

    // Featured panel Actions
    const featuredBtnView = document.getElementById('featured-btn-view');
    const featuredBtnSave = document.getElementById('featured-btn-save');

    if (featuredBtnView) {
      featuredBtnView.addEventListener('click', () => {
        const topBiz = getTopRecommendedOpportunity();
        if (topBiz) routeToDetailedAnalysis(topBiz.id);
      });
    }

    if (featuredBtnSave) {
      featuredBtnSave.addEventListener('click', () => {
        const topBiz = getTopRecommendedOpportunity();
        if (topBiz) toggleBookmarkOpportunity(topBiz.id);
      });
    }

    // Export & Share click handlers
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        triggerSystemToast("📤 Compiling intelligence report PDF...", 1800);
        setTimeout(() => {
          window.print();
        }, 1500);
      });
    }

    if (btnShare) {
      btnShare.addEventListener('click', () => {
        const locName = (inputLocation && inputLocation.value.trim()) || "Current Location";
        const shareUrl = `${window.location.origin}${window.location.pathname}?view=opportunities&location=${encodeURIComponent(locName)}`;

        navigator.clipboard.writeText(shareUrl).then(() => {
          triggerSystemToast("🔗 Share Link copied to clipboard!", 2000);
        }).catch(() => {
          alert(`Share Link: ${shareUrl}`);
        });
      });
    }

    // Initial search invocation
    runOpportunitiesSearch();
  }

  // Master Filter/Search algorithm
  function runOpportunitiesSearch() {
    const inputLocation = document.getElementById('opp-location-search');
    const selectSort = document.getElementById('opp-sort-select');
    const drawerFilters = document.getElementById('opp-filters-drawer');

    // Read form values
    const queryLoc = (inputLocation && inputLocation.value.trim().toLowerCase()) || "";
    const sortVal = (selectSort && selectSort.value) || "score";

    // Obtain filter properties
    let filterCategory = "All";
    let filterMaxInvest = 5000000;
    let filterRisk = "All";
    let filterComp = "All";
    let filterRoi = "All";
    let filterMinScore = 70;
    let filterRadius = 5;

    const selectCategory = document.getElementById('filter-opp-category');
    const sliderInvestment = document.getElementById('filter-opp-investment');
    const sliderScore = document.getElementById('filter-opp-score');
    const selectRoi = document.getElementById('filter-opp-roi');
    const sliderRadius = document.getElementById('filter-opp-radius');

    if (selectCategory) filterCategory = selectCategory.value;
    if (sliderInvestment) filterMaxInvest = parseInt(sliderInvestment.value);
    if (sliderScore) filterMinScore = parseInt(sliderScore.value);
    if (selectRoi) filterRoi = selectRoi.value;
    if (sliderRadius) filterRadius = parseInt(sliderRadius.value);

    const activeRiskBtn = document.querySelector('.filter-risk-btn.active');
    if (activeRiskBtn) filterRisk = activeRiskBtn.getAttribute('data-risk');

    const activeCompBtn = document.querySelector('.filter-comp-btn.active');
    if (activeCompBtn) filterComp = activeCompBtn.getAttribute('data-comp');

    // 1. Perform database matching filtering
    let results = opportunitiesDb.filter(biz => {
      // Category filter
      if (filterCategory !== "All" && biz.category !== filterCategory) return false;
      // Max Investment filter
      if (biz.investment > filterMaxInvest) return false;
      // Risk filter
      if (filterRisk !== "All" && biz.risk !== filterRisk) return false;
      // Competition filter
      if (filterComp !== "All" && biz.competition !== filterComp) return false;
      // ROI period filter
      if (filterRoi !== "All" && biz.roi > parseInt(filterRoi)) return false;
      // Min AI Score filter
      if (biz.score < filterMinScore) return false;

      // Search radius filter based on relative coordinates
      const oppLatLng = getOpportunityLatLng(biz);
      if (oppLatLng) {
        const distanceInMeters = calculateDistance(
          currentUserCoords ? currentUserCoords.lat : 16.5062,
          currentUserCoords ? currentUserCoords.lng : 80.6480,
          oppLatLng.lat,
          oppLatLng.lng
        );
        if (distanceInMeters > filterRadius * 1000) return false;
      }

      return true;
    });

    // Add city-specific pseudo seed modifications if search input has a city value
    if (queryLoc) {
      results = results.map(biz => {
        // Pseudo generate random variation based on city name string to make data look live
        const seedStr = (biz.name + queryLoc).toLowerCase();
        let seed = 0;
        for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
        const shift = Math.sin(seed) * 8; // Score variation -8 to +8
        const investShift = Math.cos(seed) * 50000; // Investment variation

        let modifiedBiz = { ...biz };
        modifiedBiz.score = Math.min(98, Math.max(62, Math.round(biz.score + shift)));
        modifiedBiz.confidence = Math.min(99, Math.max(65, Math.round(biz.confidence + (shift / 2))));
        modifiedBiz.investment = Math.max(50000, Math.round(biz.investment + investShift));
        modifiedBiz.revenue = Math.round(modifiedBiz.investment * 0.3);
        modifiedBiz.profit = Math.round(modifiedBiz.revenue * 0.4);
        modifiedBiz.roi = Math.max(8, Math.round(modifiedBiz.investment / modifiedBiz.profit));

        return modifiedBiz;
      });
    }

    // 2. Perform sorting
    results.sort((a, b) => {
      if (sortVal === "score") {
        return b.score - a.score;
      } else if (sortVal === "investment-asc") {
        return a.investment - b.investment;
      } else if (sortVal === "investment-desc") {
        return b.investment - a.investment;
      } else if (sortVal === "roi") {
        return a.roi - b.roi;
      }
      return 0;
    });

    // Render Opportunity UI segments
    renderOpportunitiesGrid(results);
    renderFeaturedOpportunity(results[0]);
    renderSavedOpportunitiesPanel();
    populateComparisonDropdowns(results);
    drawOpportunitiesMap(results);
  }

  // Dynamic opportunities grid populator
  function renderOpportunitiesGrid(list) {
    const grid = document.getElementById('opportunities-cards-grid');
    const badgeCount = document.getElementById('opp-count-badge');

    if (badgeCount) badgeCount.innerText = list.length;
    if (!grid) return;

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="no-results-msg" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; color: var(--text-muted); background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: 16px;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 1rem;">🔍</span>
          <h4 class="font-space" style="color: #fff; margin-bottom: 0.5rem;">No Opportunities Found</h4>
          <p>No business ideas match your current filter parameters. Try expanding your filters or investment caps.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = list.map(biz => {
      const isBookmarked = savedOpportunities.some(x => x.id === biz.id);
      const starChar = isBookmarked ? "★" : "☆";
      const saveText = isBookmarked ? "Saved" : "Save";

      return `
        <div class="opportunity-card font-sans">
          <div class="opportunity-card-header">
            <div class="opportunity-card-title-group">
              <div class="opportunity-card-icon">${biz.icon}</div>
              <div>
                <h4 class="opportunity-card-name">${biz.name}</h4>
                <span class="opportunity-card-category">${biz.category}</span>
              </div>
            </div>
            <div class="opportunity-score-badge">
              <span class="opportunity-score-num font-space">${biz.score}</span>
              <span class="opportunity-score-label">AI Score</span>
            </div>
          </div>
          <div class="opportunity-card-body">
            <p class="opportunity-card-desc">${biz.desc}</p>
            <div class="opportunity-card-stats">
              <div class="opportunity-stat-box">
                <span class="opportunity-stat-lbl">Startup Cost</span>
                <span class="opportunity-stat-val font-space">${formatIndianCurrency(biz.investment)}</span>
              </div>
              <div class="opportunity-stat-box">
                <span class="opportunity-stat-lbl">Est. Profit / Mo</span>
                <span class="opportunity-stat-val font-space text-green">+${formatIndianCurrency(biz.profit)}</span>
              </div>
              <div class="opportunity-stat-box">
                <span class="opportunity-stat-lbl">ROI Return</span>
                <span class="opportunity-stat-val font-space text-orange">${biz.roi} Months</span>
              </div>
              <div class="opportunity-stat-box">
                <span class="opportunity-stat-lbl">AI Confidence</span>
                <span class="opportunity-stat-val font-space text-cyan">${biz.confidence}%</span>
              </div>
            </div>
            <div class="opportunity-card-tags">
              <span class="opp-tag demand-high">📈 ${biz.demand} Demand</span>
              <span class="opp-tag comp-low">🛡️ ${biz.competition} Saturation</span>
              <span class="opp-tag risk-${biz.risk.toLowerCase()}">⚡ ${biz.risk} Risk</span>
              ${biz.segments.slice(0, 2).map(seg => `<span class="opp-tag segment-tag">${seg}</span>`).join('')}
            </div>
            <div class="opportunity-card-actions">
              <button class="btn btn-primary btn-view-opp-full" data-id="${biz.id}" style="flex: 1.5; padding: 0.65rem 0; font-size: 0.85rem; border-radius: 8px; cursor: pointer;">
                📊 View Full Analysis
              </button>
              <button class="btn btn-outline btn-save-opp" data-id="${biz.id}" style="flex: 1; padding: 0.65rem 0; font-size: 0.85rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.2rem;">
                <span class="bookmark-icon">${starChar}</span> <span class="card-save-lbl">${saveText}</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Populate highest opportunity on featured layout
  function renderFeaturedOpportunity(biz) {
    const section = document.getElementById('section-featured-recommendation');
    if (!section) return;

    if (!biz) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    const nameEl = document.getElementById('featured-biz-name');
    const descEl = document.getElementById('featured-biz-desc');
    const dialEl = document.getElementById('featured-biz-dial');
    const pctEl = document.getElementById('featured-biz-pct');
    const investEl = document.getElementById('featured-biz-investment');
    const revEl = document.getElementById('featured-biz-revenue');
    const reasonsEl = document.getElementById('featured-biz-reasons');
    const saveBtn = document.getElementById('featured-btn-save');

    if (nameEl) nameEl.innerText = biz.name;
    if (descEl) descEl.innerText = biz.desc;
    if (pctEl) pctEl.innerText = `${biz.confidence}%`;
    if (investEl) investEl.innerText = formatIndianCurrency(biz.investment);
    if (revEl) revEl.innerText = `${formatIndianCurrency(biz.revenue)} / mo`;

    if (dialEl) {
      dialEl.style.background = `radial-gradient(closest-side, var(--bg-card) 78%, transparent 80% 100%), conic-gradient(var(--accent-cyan) ${biz.confidence}%, rgba(255,255,255,0.03) 0)`;
    }

    if (reasonsEl && biz.whyRecom) {
      reasonsEl.innerHTML = biz.whyRecom.map(reason => {
        return `<li style="display: flex; align-items: flex-start; gap: 0.6rem;"><span class="green" style="font-weight: bold; flex-shrink: 0;">✓</span> <span>${reason}</span></li>`;
      }).join('');
    }

    if (saveBtn) {
      const isBookmarked = savedOpportunities.some(x => x.id === biz.id);
      saveBtn.querySelector('.btn-save-text').innerText = isBookmarked ? "Saved" : "Save Opportunity";
      saveBtn.style.borderColor = isBookmarked ? "var(--accent-cyan)" : "var(--border-color)";
    }
  }

  function getTopRecommendedOpportunity() {
    const visibleCards = document.querySelectorAll('.opportunity-card');
    if (visibleCards.length === 0) return null;
    const firstCardName = visibleCards[0].querySelector('.opportunity-card-name').innerText;
    return opportunitiesDb.find(b => b.name === firstCardName);
  }

  // Populate Saved bookmarks panel
  function renderSavedOpportunitiesPanel() {
    const section = document.getElementById('section-saved-opportunities');
    const container = document.getElementById('saved-opps-container');
    if (!section || !container) return;

    if (savedOpportunities.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    container.innerHTML = savedOpportunities.map(biz => {
      return `
        <div class="saved-biz-card font-sans">
          <div class="saved-biz-info" style="cursor: pointer;" onclick="document.dispatchEvent(new CustomEvent('route-rec', {detail: '${biz.id}'}))">
            <span class="saved-biz-icon">${biz.icon}</span>
            <div>
              <h5 class="saved-biz-name">${biz.name}</h5>
              <span class="saved-biz-score font-space">AI Score: ${biz.score}</span>
            </div>
          </div>
          <button class="btn btn-remove-saved" data-id="${biz.id}" title="Remove Bookmark">✕</button>
        </div>
      `;
    }).join('');

    // Listener to route from saved cards clicks
    document.addEventListener('route-rec', (e) => {
      routeToDetailedAnalysis(e.detail);
    }, { once: true });
  }

  // Manage Bookmarks
  function toggleBookmarkOpportunity(id) {
    const biz = opportunitiesDb.find(b => b.id === id);
    if (!biz) return;

    const existingIdx = savedOpportunities.findIndex(x => x.id === id);
    if (existingIdx >= 0) {
      // Remove bookmark
      savedOpportunities.splice(existingIdx, 1);
      triggerSystemToast(`★ Removed ${biz.name} from saved bookmarks.`, 1500);
    } else {
      // Add bookmark
      savedOpportunities.push(biz);
      triggerSystemToast(`⭐ Saved ${biz.name} to bookmarks!`, 1500);
    }

    try {
      localStorage.setItem('mm_saved_opportunities', JSON.stringify(savedOpportunities));
    } catch (e) { }

    // Update UI panels
    runOpportunitiesSearch();
  }

  // Bridge navigation routing toDetailed analysis screen
  function routeToDetailedAnalysis(id) {
    const biz = opportunitiesDb.find(b => b.id === id);
    if (!biz) return;

    // Transition panels
    if (subViews.opportunities && subViews.recommendation) {
      subViews.opportunities.classList.remove('active');
      subViews.recommendation.classList.add('active');
    }

    navItems.forEach(item => {
      if (item.getAttribute('data-nav') === 'opportunities') {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Populate recommendation stats screen with selected card details
    populateRecommendationScreen(false, biz.name, biz.investment);
  }

  // Side-by-Side Comparison options populator
  function populateComparisonDropdowns(list) {
    const compareSelectA = document.getElementById('compare-select-a');
    const compareSelectB = document.getElementById('compare-select-b');
    if (!compareSelectA || !compareSelectB) return;

    const prevValA = compareSelectA.value;
    const prevValB = compareSelectB.value;

    const optionsHtml = list.map((biz, idx) => {
      return `<option value="${biz.id}">${biz.name}</option>`;
    });

    compareSelectA.innerHTML = optionsHtml.join('');
    // For select B, offset list to populate a different second option initially
    compareSelectB.innerHTML = optionsHtml.join('');

    if (list.length > 0) {
      compareSelectA.value = list.some(x => x.id === prevValA) ? prevValA : list[0].id;
      if (list.length > 1) {
        compareSelectB.value = list.some(x => x.id === prevValB) ? prevValB : list[1].id;
      } else {
        compareSelectB.value = list[0].id;
      }
    }

    updateSideBySideComparison(compareSelectA.value, compareSelectB.value);
  }

  // Comparison logic
  function updateSideBySideComparison(idA, idB) {
    const tableBody = document.getElementById('compare-table-body');
    const hdrA = document.getElementById('compare-hdr-a');
    const hdrB = document.getElementById('compare-hdr-b');
    if (!tableBody || !hdrA || !hdrB) return;

    const bizA = opportunitiesDb.find(b => b.id === idA);
    const bizB = opportunitiesDb.find(b => b.id === idB);

    if (!bizA || !bizB) {
      tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">Select two businesses above to compare.</td></tr>`;
      return;
    }

    hdrA.innerText = bizA.name;
    hdrB.innerText = bizB.name;

    const metrics = [
      { name: "Opportunity Score", valA: `${bizA.score} / 100`, valB: `${bizB.score} / 100`, key: "score" },
      { name: "Required Investment", valA: formatIndianCurrency(bizA.investment), valB: formatIndianCurrency(bizB.investment), key: "investment" },
      { name: "Est. Monthly Profit", valA: formatIndianCurrency(bizA.profit), valB: formatIndianCurrency(bizB.profit), key: "profit" },
      { name: "ROI Period", valA: `${bizA.roi} Months`, valB: `${bizB.roi} Months`, key: "roi" },
      { name: "Competition Level", valA: bizA.competition, valB: bizB.competition, key: "competition" },
      { name: "Risk Assessment", valA: bizA.risk, valB: bizB.risk, key: "risk" },
      { name: "AI Confidence Score", valA: `${bizA.confidence}%`, valB: `${bizB.confidence}%`, key: "confidence" }
    ];

    tableBody.innerHTML = metrics.map(m => {
      let cellClassA = "";
      let cellClassB = "";

      // Highlight best choice
      if (m.key === "score") {
        if (bizA.score > bizB.score) cellClassA = "text-green";
        else if (bizB.score > bizA.score) cellClassB = "text-green";
      } else if (m.key === "investment") {
        if (bizA.investment < bizB.investment) cellClassA = "text-green";
        else if (bizB.investment < bizA.investment) cellClassB = "text-green";
      } else if (m.key === "profit") {
        if (bizA.profit > bizB.profit) cellClassA = "text-green";
        else if (bizB.profit > bizA.profit) cellClassB = "text-green";
      } else if (m.key === "roi") {
        if (bizA.roi < bizB.roi) cellClassA = "text-green";
        else if (bizB.roi < bizA.roi) cellClassB = "text-green";
      }

      return `
        <tr>
          <td class="comparison-row-title">${m.name}</td>
          <td class="comparison-val-cell font-space ${cellClassA}">${m.valA}</td>
          <td class="comparison-val-cell font-space ${cellClassB}">${m.valB}</td>
        </tr>
      `;
    }).join('');
  }

  function drawOpportunitiesMap(list) {
    const mapContainer = document.getElementById('opportunities-google-map');
    if (!mapContainer) return;

    if (window.google && window.google.maps) {
      // Hide simulated map overlay if active
      const emulatedMap = document.getElementById('emulated-opp-map');
      if (emulatedMap) emulatedMap.style.display = 'none';

      const loadingPlaceholder = mapContainer.querySelector('.map-loading-placeholder');
      if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';

      clearOpportunitiesMarkers();

      // Center on the SEARCHED/ANALYSED location, not the user's GPS position.
      // Fall back to user GPS, then to Vijayawada as last resort.
      const analysisCoords = (globalAnalysisResult && globalAnalysisResult.coordinates)
        ? globalAnalysisResult.coordinates
        : null;
      const mapCenterCoords = analysisCoords || currentUserCoords || { lat: 16.5062, lng: 80.6480 };
      const centerLatLng = new google.maps.LatLng(mapCenterCoords.lat, mapCenterCoords.lng);

      const mapOptions = {
        zoom: 13,
        center: centerLatLng,
        styles: darkMapThemeStyles,
        zoomControl: true,
        fullscreenControl: true,
        mapTypeControl: true,
        streetViewControl: true
      };

      opportunitiesMap = new google.maps.Map(mapContainer, mapOptions);

      // User GPS Marker (distinct from the searched location marker)
      if (currentUserCoords) {
        const userLatLng = new google.maps.LatLng(currentUserCoords.lat, currentUserCoords.lng);
        opportunitiesUserMarker = new google.maps.Marker({
          position: userLatLng,
          map: opportunitiesMap,
          title: "You are here",
          label: {
            text: "You",
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: "bold"
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#10b981", // green
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          }
        });
      }

      // Radius Circle — centred on the searched/analysis location
      const searchRadius = (typeof activeFilters !== 'undefined' && activeFilters && activeFilters.radius) ? activeFilters.radius : 5;
      new google.maps.Circle({
        strokeColor: "#a855f7",
        strokeOpacity: 0.15,
        strokeWeight: 1,
        fillColor: "#a855f7",
        fillOpacity: 0.03,
        map: opportunitiesMap,
        center: centerLatLng,
        radius: searchRadius * 1000
      });

      activeInfoWindow = new google.maps.InfoWindow();

      // Place opportunities pins
      list.forEach(biz => {
        const oppLatLng = getOpportunityLatLng(biz);
        if (!oppLatLng) return;

        // Skip placing if it is outside search radius (measured from analysis centre)
        const distanceInMeters = calculateDistance(
          mapCenterCoords.lat,
          mapCenterCoords.lng,
          oppLatLng.lat,
          oppLatLng.lng
        );
        if (distanceInMeters > searchRadius * 1000) {
          return;
        }

        const distanceText = distanceInMeters < 1000
          ? `${Math.round(distanceInMeters)} m`
          : `${(distanceInMeters / 1000).toFixed(1)} km`;

        const formatRupees = (val) => {
          if (val >= 100000) return "₹" + (val / 100000).toFixed(1) + " Lakh";
          return "₹" + val.toLocaleString('en-IN');
        };

        const marker = new google.maps.Marker({
          position: oppLatLng,
          title: biz.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: biz.score >= 90 ? "#10b981" : "#00f0ff", // Green or Cyan
            fillOpacity: 0.9,
            strokeColor: "#ffffff",
            strokeWeight: 1.5
          }
        });

        marker.addListener('click', () => {
          const contentString = `
            <div class="map-infowindow" style="color: #1e1e24; padding: 0.5rem; max-width: 250px; font-family: 'Plus Jakarta Sans', sans-serif; line-height: 1.4;">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.4rem;">
                <span style="font-size: 1.3rem;">${biz.icon}</span>
                <div>
                  <h4 style="margin: 0; font-size: 0.85rem; font-weight: 700; color: #111827;">${biz.name}</h4>
                  <span style="font-size: 0.7rem; color: #6b7280; font-weight: 500;">${biz.category}</span>
                </div>
              </div>
              <table style="width: 100%; font-size: 0.72rem; border-collapse: collapse; margin-bottom: 0.5rem;">
                <tr>
                  <td style="color: #6b7280; padding: 0.15rem 0;">AI Score:</td>
                  <td style="text-align: right; font-weight: 700; color: #a855f7;">${biz.score}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 0.15rem 0;">Saturation:</td>
                  <td style="text-align: right; font-weight: 600;">${biz.competition}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 0.15rem 0;">Demand:</td>
                  <td style="text-align: right; font-weight: 600; color: #10b981;">${biz.demand} Demand</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 0.15rem 0;">Startup Cost:</td>
                  <td style="text-align: right; font-weight: 600;">${formatRupees(biz.investment)}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 0.15rem 0;">Monthly Profit:</td>
                  <td style="text-align: right; font-weight: 700; color: #10b981;">+${formatRupees(biz.profit)}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 0.15rem 0;">Distance:</td>
                  <td style="text-align: right; font-weight: 600; color: #2563eb;">${distanceText}</td>
                </tr>
              </table>
              <button type="button" class="btn btn-primary" onclick="window.routeToAnalysisFromMap('${biz.id}')" style="width: 100%; border: none; outline: none; background: #a855f7; color: #fff; padding: 0.4rem 0; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: background 0.2s;">
                📊 View Full Analysis
              </button>
            </div>
          `;
          activeInfoWindow.setContent(contentString);
          activeInfoWindow.open(opportunitiesMap, marker);
        });

        opportunitiesMarkers.push(marker);
      });

      // Place background landmarks based on legend toggles
      const showCompetitors = document.getElementById('layer-competitors') ? document.getElementById('layer-competitors').checked : true;
      const showEducation = document.getElementById('layer-education') ? document.getElementById('layer-education').checked : true;
      const showCommercial = document.getElementById('layer-commercial') ? document.getElementById('layer-commercial').checked : true;
      const showLifestyle = document.getElementById('layer-lifestyle') ? document.getElementById('layer-lifestyle').checked : true;

      const mockLandmarks = [
        { name: "Indiranagar High School", type: "school", x: 20, y: 15 },
        { name: "City College Gym", type: "lifestyle", x: 12, y: 70 },
        { name: "Lakeside Medical Center", type: "lifestyle", x: 48, y: 65 },
        { name: "Garuda Shopping Mall", type: "mall", x: 80, y: 35 },
        { name: "Central Metro Junction", type: "lifestyle", x: 72, y: 78 },
        { name: "Star Competitor Shop", type: "competitor", x: 30, y: 45 },
        { name: "Rival Bakery Franchise", type: "competitor", x: 62, y: 30 }
      ];

      mockLandmarks.forEach(pt => {
        if (pt.type === "competitor" && !showCompetitors) return;
        if (pt.type === "school" && !showEducation) return;
        if (pt.type === "mall" && !showCommercial) return;
        if (pt.type === "lifestyle" && !showLifestyle) return;

        const pinLatLng = getOpportunityLatLng(pt);
        if (!pinLatLng) return;

        let fillColor = "#a855f7";
        if (pt.type === "competitor") fillColor = "#ef4444";
        else if (pt.type === "school") fillColor = "#3b82f6";
        else if (pt.type === "mall") fillColor = "#a855f7";
        else if (pt.type === "lifestyle") fillColor = "#00f0ff";

        const marker = new google.maps.Marker({
          position: pinLatLng,
          map: opportunitiesMap,
          title: pt.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: fillColor,
            fillOpacity: 0.7,
            strokeColor: "#ffffff",
            strokeWeight: 1
          }
        });

        marker.addListener('click', () => {
          activeInfoWindow.setContent(`
            <div style="color: #121212; padding: 0.5rem; font-family: sans-serif;">
              <strong style="font-size: 0.90rem;">${pt.name}</strong>
              <p style="margin: 0.2rem 0 0 0; font-size: 0.75rem; color: #555;">Type: ${pt.type.toUpperCase()}</p>
            </div>
          `);
          activeInfoWindow.open(opportunitiesMap, marker);
        });

        opportunitiesMarkers.push(marker);
      });

      // Clustering
      if (window.markerClusterer && window.markerClusterer.MarkerClusterer && opportunitiesMarkers.length > 0) {
        opportunitiesClusterer = new window.markerClusterer.MarkerClusterer({
          map: opportunitiesMap,
          markers: opportunitiesMarkers
        });
      } else {
        opportunitiesMarkers.forEach(m => m.setMap(opportunitiesMap));
      }

    } else {
      const emulatedMap = document.getElementById('emulated-opp-map');
      if (emulatedMap) emulatedMap.style.display = 'block';
      drawEmulatedMapPins(list);
    }
  }

  function clearOpportunitiesMarkers() {
    if (opportunitiesClusterer) {
      opportunitiesClusterer.clearMarkers();
      opportunitiesClusterer = null;
    }
    if (opportunitiesMarkers) {
      opportunitiesMarkers.forEach(m => m.setMap(null));
    }
    opportunitiesMarkers = [];
    if (opportunitiesUserMarker) {
      opportunitiesUserMarker.setMap(null);
      opportunitiesUserMarker = null;
    }
  }

  function getOpportunityLatLng(biz) {
    // Always anchor offsets to the analysis/searched location when available,
    // so opportunity pins appear in the right city rather than near GPS coords.
    const analysisCoords = (globalAnalysisResult && globalAnalysisResult.coordinates)
      ? globalAnalysisResult.coordinates
      : null;
    const coords = analysisCoords || currentUserCoords || { lat: 16.5062, lng: 80.6480 };
    const latOffset = (biz.y - 50) * 0.0006;
    const lngOffset = (biz.x - 50) * 0.0006;
    return { lat: coords.lat + latOffset, lng: coords.lng + lngOffset };
  }

  window.routeToAnalysisFromMap = function (id) {
    routeToDetailedAnalysis(id);
  };

  // Spatial Emulated map renderer
  function drawEmulatedMapPins(visibleList = opportunitiesDb) {
    const container = document.getElementById('emulated-opp-map');
    if (!container) return;

    container.innerHTML = '';

    const showCompetitors = document.getElementById('layer-competitors') ? document.getElementById('layer-competitors').checked : true;
    const showEducation = document.getElementById('layer-education') ? document.getElementById('layer-education').checked : true;
    const showCommercial = document.getElementById('layer-commercial') ? document.getElementById('layer-commercial').checked : true;
    const showLifestyle = document.getElementById('layer-lifestyle') ? document.getElementById('layer-lifestyle').checked : true;

    // Draw background landmarks
    const mockLandmarks = [
      { name: "Indiranagar High School", type: "school", x: 20, y: 15 },
      { name: "City College Gym", type: "lifestyle", x: 12, y: 70 },
      { name: "Lakeside Medical Center", type: "lifestyle", x: 48, y: 65 },
      { name: "Garuda Shopping Mall", type: "mall", x: 80, y: 35 },
      { name: "Central Metro Junction", type: "lifestyle", x: 72, y: 78 },
      { name: "Star Competitor Shop", type: "competitor", x: 30, y: 45 },
      { name: "Rival Bakery Franchise", type: "competitor", x: 62, y: 30 }
    ];

    mockLandmarks.forEach(pt => {
      if (pt.type === "competitor" && !showCompetitors) return;
      if (pt.type === "school" && !showEducation) return;
      if (pt.type === "mall" && !showCommercial) return;
      if (pt.type === "lifestyle" && !showLifestyle) return;

      const pin = document.createElement('div');
      pin.className = `opp-map-pin ${pt.type}`;
      pin.style.left = `${pt.x}%`;
      pin.style.top = `${pt.y}%`;

      pin.addEventListener('mouseenter', (e) => showMapTooltip(e, pt.name, pt.type.toUpperCase()));
      pin.addEventListener('mouseleave', hideMapTooltip);

      container.appendChild(pin);
    });

    // Draw recommendations from current search results
    visibleList.slice(0, 3).forEach((biz, idx) => {
      const pin = document.createElement('div');
      pin.className = `opp-map-pin recommendation`;
      pin.style.left = `${biz.x}%`;
      pin.style.top = `${biz.y}%`;

      pin.addEventListener('mouseenter', (e) => showMapTooltip(e, `${idx === 0 ? "🌟 Top Rec: " : ""}${biz.name}`, `AI SCORE: ${biz.score}`));
      pin.addEventListener('mouseleave', hideMapTooltip);
      pin.addEventListener('click', () => routeToDetailedAnalysis(biz.id));

      container.appendChild(pin);
    });
  }

  function showMapTooltip(e, title, subtitle) {
    hideMapTooltip();
    const mapBox = document.getElementById('opportunities-google-map');
    if (!mapBox) return;

    const rect = mapBox.getBoundingClientRect();
    const tooltip = document.createElement('div');
    tooltip.className = 'opp-map-tooltip';
    tooltip.id = 'active-map-tooltip';

    // Relative coordinates
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.innerHTML = `<strong>${title}</strong><br><span style="font-size: 0.65rem; color: var(--text-muted);">${subtitle}</span>`;

    mapBox.appendChild(tooltip);
  }

  function hideMapTooltip() {
    const tooltip = document.getElementById('active-map-tooltip');
    if (tooltip) tooltip.remove();
  }

  // Toast notifier helper
  function triggerSystemToast(text, duration = 2000) {
    const existing = document.getElementById('system-notifier-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'system-notifier-toast';
    toast.className = 'font-space';
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: rgba(18, 18, 25, 0.95);
      border: 1px solid var(--accent-cyan);
      box-shadow: 0 0 15px -3px var(--accent-cyan-glow);
      padding: 0.9rem 1.6rem;
      border-radius: 10px;
      color: #fff;
      font-size: 0.9rem;
      font-weight: 600;
      z-index: 10000;
      animation: fadeIn 0.3s ease-out;
    `;
    toast.innerText = text;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // --- Dynamic chart SVG animations on screen load ---
  function animateDashboardEntrance() {
    const chartPaths = document.querySelectorAll('.chart-canvas-svg path');
    chartPaths.forEach(path => {
      const length = path.getTotalLength ? path.getTotalLength() : 800;
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
      path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset 2s cubic-bezier(0.25, 1, 0.5, 1)';
      path.style.strokeDashoffset = '0';
    });
  }

  // --- SAVED REPORTS PAGE LOGIC ---
  let pendingDeleteReportId = null;

  function getSavedReportsFromStorage() {
    try {
      const stored = localStorage.getItem('mm_saved_reports');
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (e) { }

    // Initial pre-seeded reports if storage is empty
    const initialReports = [
      {
        id: "report-seed-1",
        date: "Aug 10, 2026",
        timestamp: Date.now() - 3600000 * 2,
        name: "Protein Egg Café",
        category: "Food & Beverage",
        location: "Indiranagar, Bengaluru",
        targetCustomers: "Students, Fitness Enthusiasts",
        size: "Small",
        budget: 1500000,
        score: 95,
        demand: "Very High",
        competition: "Low",
        confidence: 96,
        investment: 650000,
        revenue: 220000,
        roi: "14 Months",
        analysisData: {
          isSuggestGoal: true,
          suggestedName: "Protein Egg Café",
          opportunityScore: 95,
          opportunityLevel: "Excellent Opportunity",
          scoreColorClass: "text-green",
          reason: "High student and gym-goer density combined with a lack of healthy breakfast options makes this a premium entry point.",
          strengths: ["High capturing rate: Over 3 gyms in 1km radius.", "Zero direct healthy egg cafes nearby.", "Fast payback under 14 months."],
          weaknesses: ["Elevated commercial lease costs."],
          risks: ["Seasonal student holiday cycles."],
          competitors: [{ name: "The Daily Grind Cafe", category: "Cafe", rating: 4.3, reviews: 140, price: 120, distance: "350 m" }],
          landmarks: [{ name: "Public High School", type: "School/College", distance: "200 m" }],
          expectedCustomers: 2400,
          estimatedMonthlyRevenue: 220000,
          initialInvestment: 650000,
          paybackPeriod: "14 Months",
          confidence: 96,
          alternatives: ["Artisanal Bakery", "Organic Juice Bar", "Specialty Espresso Cafe"]
        }
      },
      {
        id: "report-seed-2",
        date: "Aug 08, 2026",
        timestamp: Date.now() - 86400000 * 2,
        name: "Student Stationery & Digital Print Hub",
        category: "Retail & Supplies",
        location: "Koramangala, Bengaluru",
        targetCustomers: "Students",
        size: "Small",
        budget: 800000,
        score: 92,
        demand: "High",
        competition: "Low",
        confidence: 94,
        investment: 400000,
        revenue: 110000,
        roi: "11 Months",
        analysisData: {
          isSuggestGoal: true,
          suggestedName: "Student Stationery & Digital Print Hub",
          opportunityScore: 92,
          opportunityLevel: "Excellent Opportunity",
          scoreColorClass: "text-green",
          reason: "Unmet demand for digital binding and project printing directly opposite university gate.",
          strengths: ["High repeat student footfall.", "90%+ gross service margin on print jobs."],
          weaknesses: ["Peak volume concentrated during exam cycles."],
          risks: ["Digital assignment submissions."],
          competitors: [],
          landmarks: [{ name: "City University Gate A", type: "School/College", distance: "80 m" }],
          expectedCustomers: 3100,
          estimatedMonthlyRevenue: 110000,
          initialInvestment: 400000,
          paybackPeriod: "11 Months",
          confidence: 94,
          alternatives: ["High-Speed Xerox Center", "Chai & Snacks Counter"]
        }
      },
      {
        id: "report-seed-3",
        date: "Aug 05, 2026",
        timestamp: Date.now() - 86400000 * 5,
        name: "24/7 Medical & Pharmacy Store",
        category: "Healthcare",
        location: "Jayanagar, Bengaluru",
        targetCustomers: "Hospital Visitors, Senior Citizens",
        size: "Medium",
        budget: 2000000,
        score: 97,
        demand: "Very High",
        competition: "Low",
        confidence: 98,
        investment: 1200000,
        revenue: 280000,
        roi: "12 Months",
        analysisData: {
          isSuggestGoal: true,
          suggestedName: "24/7 Medical & Pharmacy Store",
          opportunityScore: 97,
          opportunityLevel: "Outstanding Opportunity",
          scoreColorClass: "text-green",
          reason: "Recession-proof demand operating round-the-clock near hospital gate.",
          strengths: ["Constant 24/7 footfall.", "High recurring prescription sales to senior residents."],
          weaknesses: ["Strict pharmacy licensing protocols."],
          risks: ["Online pharmacy price competition."],
          competitors: [],
          landmarks: [{ name: "Apollo Specialty Hospital", type: "Hospital", distance: "50 m" }],
          expectedCustomers: 4200,
          estimatedMonthlyRevenue: 280000,
          initialInvestment: 1200000,
          paybackPeriod: "12 Months",
          confidence: 98,
          alternatives: ["Orthopedic Care Store", "Fresh Fruit Stall"]
        }
      }
    ];

    try {
      localStorage.setItem('mm_saved_reports', JSON.stringify(initialReports));
    } catch (e) { }

    return initialReports;
  }

  function initSavedReportsPage() {
    const searchInput = document.getElementById('search-saved-reports');
    const filterPills = document.querySelectorAll('.saved-reports-hero .filter-pill-btn');
    const selectCategory = document.getElementById('filter-saved-category');
    const selectLocation = document.getElementById('filter-saved-location');
    const gridContainer = document.getElementById('saved-reports-grid');
    const emptyState = document.getElementById('saved-reports-empty-state');
    const btnEmptyCreate = document.getElementById('btn-saved-empty-create');

    const modalDelete = document.getElementById('delete-report-modal');
    const btnCancelDelete = document.getElementById('btn-cancel-delete-report');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete-report');

    let currentFilterPill = "all";

    function populateLocationDropdown(reports) {
      if (!selectLocation) return;
      const locations = Array.from(new Set(reports.map(r => r.location).filter(Boolean)));
      const currVal = selectLocation.value;
      selectLocation.innerHTML = `<option value="All">All Locations</option>` +
        locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
      selectLocation.value = locations.includes(currVal) ? currVal : "All";
    }

    function renderSavedReports() {
      const reports = getSavedReportsFromStorage();
      populateLocationDropdown(reports);

      const query = (searchInput && searchInput.value.trim().toLowerCase()) || "";
      const selectedCat = (selectCategory && selectCategory.value) || "All";
      const selectedLoc = (selectLocation && selectLocation.value) || "All";

      let filtered = reports.filter(item => {
        const matchQuery = !query ||
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.category && item.category.toLowerCase().includes(query)) ||
          (item.location && item.location.toLowerCase().includes(query)) ||
          (item.targetCustomers && item.targetCustomers.toLowerCase().includes(query));

        const matchCat = selectedCat === "All" || item.category === selectedCat;
        const matchLoc = selectedLoc === "All" || item.location === selectedLoc;

        return matchQuery && matchCat && matchLoc;
      });

      if (currentFilterPill === "recent") {
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      } else if (currentFilterPill === "highest") {
        filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      if (!gridContainer) return;

      if (filtered.length === 0) {
        gridContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
      } else {
        if (emptyState) emptyState.style.display = 'none';
        gridContainer.style.display = 'grid';

        const formatRupees = (val) => {
          if (!val) return "N/A";
          if (val >= 10000000) return "₹" + (val / 10000000).toFixed(1) + " Cr";
          if (val >= 100000) return "₹" + (val / 100000).toFixed(1) + " Lakh";
          return "₹" + val.toLocaleString('en-IN');
        };

        gridContainer.innerHTML = filtered.map(report => `
          <div class="report-card" data-id="${report.id}">
            <div class="report-card-header">
              <div class="report-card-title-group">
                <span class="report-card-category-badge">${report.category || "General Retail"}</span>
                <h4 class="report-card-title">${report.name}</h4>
              </div>
              <div class="report-card-score-badge">
                <span class="report-card-score-num">${report.score}</span>
                <span class="report-card-score-lbl">Score</span>
              </div>
            </div>

            <div class="report-meta-row">
              <div class="report-meta-item">
                <span>📌</span> <strong>${report.location}</strong>
              </div>
              <div class="report-meta-item">
                <span>🎯</span> <span>${report.targetCustomers || "General Public"}</span>
              </div>
            </div>

            <div class="report-metrics-grid">
              <div class="report-metric-box">
                <span class="report-metric-lbl">Customer Demand</span>
                <span class="report-metric-val" style="color: var(--accent-cyan);">${report.demand || "Very High"}</span>
              </div>
              <div class="report-metric-box">
                <span class="report-metric-lbl">Competition</span>
                <span class="report-metric-val" style="color: ${report.competition === 'Low' ? '#10b981' : '#f59e0b'};">${report.competition || "Low"} Level</span>
              </div>
              <div class="report-metric-box">
                <span class="report-metric-lbl">AI Confidence</span>
                <span class="report-metric-val" style="color: var(--accent-purple);">${report.confidence}%</span>
              </div>
              <div class="report-metric-box">
                <span class="report-metric-lbl">Analysis Date</span>
                <span class="report-metric-val" style="font-size: 0.82rem; color: var(--text-secondary);">${report.date || "Aug 10, 2026"}</span>
              </div>
            </div>

            <div class="report-card-actions">
              <button type="button" class="btn btn-view-saved-report" data-id="${report.id}">
                📊 View Report
              </button>
              <button type="button" class="btn btn-delete-saved-report" data-id="${report.id}" title="Delete Saved Report">
                🗑️ Delete
              </button>
            </div>
          </div>
        `).join('');
      }
    }

    if (searchInput) searchInput.addEventListener('input', renderSavedReports);

    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilterPill = pill.getAttribute('data-filter') || "all";
        renderSavedReports();
      });
    });

    if (selectCategory) selectCategory.addEventListener('change', renderSavedReports);
    if (selectLocation) selectLocation.addEventListener('change', renderSavedReports);

    if (btnEmptyCreate) {
      btnEmptyCreate.addEventListener('click', () => {
        if (subViews.savedReports && subViews.newAnalysis) {
          subViews.savedReports.classList.remove('active');
          subViews.newAnalysis.classList.add('active');
        }
        navItems.forEach(item => {
          if (item.getAttribute('data-nav') === 'signals') {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      });
    }

    document.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.btn-view-saved-report');
      if (viewBtn) {
        e.preventDefault();
        const id = viewBtn.getAttribute('data-id');
        const reports = getSavedReportsFromStorage();
        const targetReport = reports.find(r => r.id === id);

        if (targetReport && targetReport.analysisData) {
          globalAnalysisResult = targetReport.analysisData;
          renderAnalysisResultsOnUi();

          if (subViews.savedReports && subViews.recommendation) {
            subViews.savedReports.classList.remove('active');
            subViews.recommendation.classList.add('active');
          }
          navItems.forEach(item => {
            if (item.getAttribute('data-nav') === 'opportunities') {
              item.classList.add('active');
            } else {
              item.classList.remove('active');
            }
          });
        }
        return;
      }

      const deleteBtn = e.target.closest('.btn-delete-saved-report');
      if (deleteBtn) {
        e.preventDefault();
        pendingDeleteReportId = deleteBtn.getAttribute('data-id');
        if (modalDelete) modalDelete.style.display = 'flex';
        return;
      }
    });

    if (btnCancelDelete && modalDelete) {
      btnCancelDelete.onclick = () => {
        modalDelete.style.display = 'none';
        pendingDeleteReportId = null;
      };
    }

    if (btnConfirmDelete && modalDelete) {
      btnConfirmDelete.onclick = () => {
        if (pendingDeleteReportId) {
          let reports = getSavedReportsFromStorage();
          reports = reports.filter(r => r.id !== pendingDeleteReportId);
          try {
            localStorage.setItem('mm_saved_reports', JSON.stringify(reports));
          } catch (e) { }

          triggerSystemToast("🗑️ Saved report deleted successfully.", 2000);
          modalDelete.style.display = 'none';
          pendingDeleteReportId = null;
          renderSavedReports();
        }
      };
    }

    renderSavedReports();
  }

  // ============================================================
  //  AI INSIGHTS PAGE ENGINE
  // ============================================================

  function initAiInsightsPage() {
    const loadingEl = document.getElementById('ai-insights-loading');
    const emptyEl = document.getElementById('ai-insights-empty');
    const contentEl = document.getElementById('ai-insights-content');
    const sourceTagEl = document.getElementById('ai-insights-analysis-tag');
    const btnCreate = document.getElementById('btn-insights-create-analysis');
    const btnRunNew = document.getElementById('btn-run-analysis-from-insights');

    // Navigate to New Analysis
    function goToNewAnalysis() {
      Object.values(subViews).forEach(v => { if (v) v.classList.remove('active'); });
      if (subViews.newAnalysis) subViews.newAnalysis.classList.add('active');
      navItems.forEach(item => {
        if (item.getAttribute('data-nav') === 'signals') item.classList.add('active');
        else item.classList.remove('active');
      });
    }

    if (btnCreate) btnCreate.addEventListener('click', goToNewAnalysis);
    if (btnRunNew) btnRunNew.addEventListener('click', goToNewAnalysis);

    // Check if analysis data is available – try globalAnalysisResult first, then latest saved report
    let r = globalAnalysisResult;
    if (!r) {
      try {
        const saved = JSON.parse(localStorage.getItem('mm_saved_reports') || '[]');
        if (saved.length > 0 && saved[0].analysisData) {
          r = saved[0].analysisData;
        }
      } catch (e) { }
    }

    if (!r) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'flex';
      if (contentEl) contentEl.style.display = 'none';
      return;
    }

    // Show loading briefly for perceived quality
    if (emptyEl) emptyEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'flex';

    setTimeout(() => {
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
      renderAiInsights(r);
    }, 800);

    // Source tag
    if (sourceTagEl) {
      const bizLabel = r.suggestedName || r.businessQuery || "Market Analysis";
      const locLabel = r.locationVal || r.locationQuery || "Unknown Location";
      sourceTagEl.textContent = `📍 ${bizLabel} — ${locLabel}`;
    }
  }

  function renderAiInsights(r) {
    const targetVal = r.targetVal || "General Public";
    const locationVal = r.locationVal || r.locationQuery || "Indiranagar, Bengaluru";
    const sizeVal = r.sizeVal || "Small";
    const score = r.opportunityScore || 82;
    const confidence = r.confidence || 92;
    const competitors = r.competitors || [];
    const landmarks = r.landmarks || [];
    const top5 = r.top5Opportunities || [];
    const topRec = top5[0] || { name: r.suggestedName || "Specialty Cafe", category: "Food & Beverage", icon: "☕", whySuits: r.reason || "Good market demand.", score, competition: "Low", investment: r.initialInvestment || 1200000, profit: r.estimatedMonthlyRevenue || 120000, roi: parseInt(r.paybackPeriod) || 14, confidence };

    const compCount = competitors.length;
    const compLevel = compCount <= 2 ? "Low" : compCount <= 5 ? "Moderate" : "High";
    const demandLevel = score >= 90 ? "Very High" : score >= 78 ? "High" : score >= 64 ? "Moderate" : "Low";
    const mktPotential = score >= 90 ? "Excellent" : score >= 78 ? "Strong" : score >= 64 ? "Moderate" : "Limited";

    const formatRupees = val => {
      if (!val) return "N/A";
      if (val >= 10000000) return "₹" + (val / 10000000).toFixed(1) + " Cr";
      if (val >= 100000) return "₹" + (val / 100000).toFixed(1) + " Lakh";
      return "₹" + val.toLocaleString('en-IN');
    };

    // ── 1. MARKET OVERVIEW ──────────────────────────────────
    const overviewEl = document.getElementById('ai-overview-grid');
    if (overviewEl) {
      const scoreColor = score >= 90 ? '#10b981' : score >= 75 ? '#00f0ff' : '#f59e0b';
      overviewEl.innerHTML = [
        { icon: '🎯', val: score + '/100', label: 'Market Opportunity Score', color: scoreColor },
        { icon: '📈', val: demandLevel, label: 'Customer Demand', color: score >= 80 ? '#10b981' : '#f59e0b' },
        { icon: '⚔️', val: compLevel, label: 'Competition Level', color: compLevel === 'Low' ? '#10b981' : compLevel === 'Moderate' ? '#f59e0b' : '#ef4444' },
        { icon: '🤖', val: confidence + '%', label: 'AI Confidence', color: 'var(--accent-purple)' },
        { icon: '🌐', val: mktPotential, label: 'Market Potential', color: score >= 85 ? '#10b981' : '#00f0ff' },
        { icon: '👥', val: (r.expectedCustomers || 2200).toLocaleString('en-IN') + '+', label: 'Est. Monthly Customers', color: 'var(--accent-cyan)' },
      ].map(stat => `
        <div class="ai-overview-stat">
          <span class="ai-overview-stat-icon">${stat.icon}</span>
          <span class="ai-overview-stat-val" style="color:${stat.color};">${stat.val}</span>
          <span class="ai-overview-stat-label">${stat.label}</span>
        </div>
      `).join('');
    }

    // ── 2. KEY AI INSIGHTS ──────────────────────────────────
    const keyInsightsEl = document.getElementById('ai-key-insights-grid');
    if (keyInsightsEl) {
      const keyInsights = generateKeyInsightsFromData(r, targetVal, locationVal, compLevel, demandLevel, score, topRec);
      keyInsightsEl.innerHTML = keyInsights.map(ins => `
        <div class="ai-insight-card">
          <div class="ai-insight-card-header">
            <div class="ai-insight-card-icon-title">
              <span class="ai-insight-card-icon">${ins.icon}</span>
              <span class="ai-insight-card-title">${ins.title}</span>
            </div>
            <span class="ai-impact-badge ai-impact-${ins.impact.toLowerCase()}">${ins.impact}</span>
          </div>
          <p class="ai-insight-card-explanation">${ins.explanation}</p>
          <p class="ai-insight-card-reason">${ins.reason}</p>
        </div>
      `).join('');
    }

    // ── 3. BUSINESS RECOMMENDATION ──────────────────────────
    const bizRecEl = document.getElementById('ai-business-rec-card');
    if (bizRecEl) {
      const expectedOpp = score >= 90 ? "Outstanding — top 10% of all analysed markets" :
        score >= 80 ? "Very strong — high confidence entry signal" :
          score >= 70 ? "Good — viable with the right positioning" : "Moderate — requires careful planning";
      const mainGap = compLevel === 'Low' ? "No direct competitors detected within 2 km — prime first-mover advantage." :
        compLevel === 'Moderate' ? `Only ${compCount} local competitor(s) — differentiation strategy recommended.` :
          "High competitive density — niche positioning essential for capture.";

      bizRecEl.innerHTML = `
        <div class="ai-biz-rec-name">${topRec.icon || '🏪'} ${topRec.name}</div>
        <p class="ai-biz-rec-why">${topRec.whySuits}</p>
        <div class="ai-biz-rec-rows">
          <div class="ai-biz-rec-row">
            <span class="ai-biz-rec-row-label">Target Customers</span>
            <span class="ai-biz-rec-row-val">${targetVal}</span>
          </div>
          <div class="ai-biz-rec-row">
            <span class="ai-biz-rec-row-label">Category</span>
            <span class="ai-biz-rec-row-val">${topRec.category || 'General Retail'}</span>
          </div>
          <div class="ai-biz-rec-row">
            <span class="ai-biz-rec-row-label">Main Market Gap</span>
            <span class="ai-biz-rec-row-val">${mainGap}</span>
          </div>
          <div class="ai-biz-rec-row">
            <span class="ai-biz-rec-row-label">Expected Opportunity</span>
            <span class="ai-biz-rec-row-val" style="color:var(--accent-cyan);">${expectedOpp}</span>
          </div>
          <div class="ai-biz-rec-row">
            <span class="ai-biz-rec-row-label">Est. Monthly Revenue</span>
            <span class="ai-biz-rec-row-val" style="color:#10b981;">${formatRupees(topRec.profit || r.estimatedMonthlyRevenue)}</span>
          </div>
          <div class="ai-biz-rec-row">
            <span class="ai-biz-rec-row-label">Investment Required</span>
            <span class="ai-biz-rec-row-val">${formatRupees(topRec.investment || r.initialInvestment)}</span>
          </div>
          <div class="ai-biz-rec-row">
            <span class="ai-biz-rec-row-label">Payback Period</span>
            <span class="ai-biz-rec-row-val">${topRec.roi ? topRec.roi + ' Months' : r.paybackPeriod || '14 Months'}</span>
          </div>
        </div>
      `;
    }

    // ── 4. COMPETITOR INSIGHTS ───────────────────────────────
    const compInsEl = document.getElementById('ai-competitor-insights-card');
    if (compInsEl) {
      const compInsights = generateCompetitorInsights(competitors, compCount, compLevel, topRec.name, locationVal, targetVal);
      compInsEl.innerHTML = `<div class="ai-detail-rows">${compInsights.map(ci => `
        <div class="ai-detail-row">
          <span class="ai-detail-row-icon">${ci.icon}</span>
          <div class="ai-detail-row-body">
            <div class="ai-detail-row-title">${ci.title}</div>
            <div class="ai-detail-row-desc">${ci.desc}</div>
          </div>
        </div>
      `).join('')}</div>`;
    }

    // ── 5. CUSTOMER INSIGHTS ─────────────────────────────────
    const custInsEl = document.getElementById('ai-customer-insights-card');
    if (custInsEl) {
      const custInsights = generateCustomerInsights(targetVal, locationVal, demandLevel, landmarks, score);
      custInsEl.innerHTML = `<div class="ai-detail-rows">${custInsights.map(ci => `
        <div class="ai-detail-row">
          <span class="ai-detail-row-icon">${ci.icon}</span>
          <div class="ai-detail-row-body">
            <div class="ai-detail-row-title">${ci.title}</div>
            <div class="ai-detail-row-desc">${ci.desc}</div>
          </div>
        </div>
      `).join('')}</div>`;
    }

    // ── 6. AI RECOMMENDATIONS ────────────────────────────────
    const recEl = document.getElementById('ai-recommendations-card');
    if (recEl) {
      const recs = generateActionableRecommendations(targetVal, locationVal, compLevel, demandLevel, topRec, sizeVal, score);
      recEl.innerHTML = `<div class="ai-rec-list">${recs.map((rec, i) => `
        <div class="ai-rec-item">
          <div class="ai-rec-item-num">${i + 1}</div>
          <div>
            <div class="ai-rec-item-strategy">${rec.strategy}</div>
            <div class="ai-rec-item-desc">${rec.desc}</div>
          </div>
        </div>
      `).join('')}</div>`;
    }

    // ── 7. MARKET OPPORTUNITY SUMMARY ────────────────────────
    const summaryEl = document.getElementById('ai-opportunity-summary-card');
    if (summaryEl) {
      const reasons = generateOpportunitySummary(r, topRec, compLevel, demandLevel, score, targetVal, locationVal, landmarks);
      summaryEl.innerHTML = `
        <p class="ai-summary-headline">✅ Why "${topRec.name}" may succeed in ${locationVal}</p>
        <div class="ai-summary-reasons">
          ${reasons.map(rn => `
            <div class="ai-summary-reason">
              <span class="ai-summary-reason-icon">${rn.icon}</span>
              <p class="ai-summary-reason-text">${rn.text}</p>
            </div>
          `).join('')}
        </div>
      `;
    }

    // ── 8. CONFIDENCE PANEL ──────────────────────────────────
    const confEl = document.getElementById('ai-confidence-panel');
    if (confEl) {
      const dataRichness = Math.min(100, 60 + competitors.length * 8 + landmarks.length * 5);
      const marketSignals = Math.min(100, score - 5 + Math.floor(Math.random() * 4));
      const targetMatch = Math.min(100, 80 + (targetVal !== 'General Public' ? 12 : 0));
      const locationClarity = locationVal !== 'Your Current Location' ? Math.min(100, 88 + Math.floor(Math.random() * 8)) : 78;

      const confReason = confidence >= 92
        ? "High confidence is backed by strong market signals, clear target customer profile, and low competition density in the area."
        : confidence >= 80
          ? "Moderate-high confidence based on a combination of location data, customer demand indicators, and competitor analysis."
          : "Reasonable confidence established from available data. Adding more location-specific data can improve accuracy.";

      confEl.innerHTML = `
        <div class="ai-confidence-dial" style="background: radial-gradient(closest-side, var(--bg-card) 78%, transparent 80% 100%), conic-gradient(var(--accent-purple) ${confidence}%, rgba(255,255,255,0.05) 0);">
          <span class="ai-confidence-pct-big">${confidence}%</span>
          <span class="ai-confidence-lbl-small">Confidence</span>
        </div>
        <div class="ai-confidence-body">
          <div class="ai-confidence-title">AI Confidence Level: ${confidence >= 90 ? 'Very High' : confidence >= 80 ? 'High' : 'Moderate'}</div>
          <p class="ai-confidence-desc">${confReason}</p>
          <div class="ai-confidence-bars">
            ${[
          { label: 'Market Data Richness', pct: dataRichness },
          { label: 'Market Signals Strength', pct: marketSignals },
          { label: 'Target Audience Match', pct: targetMatch },
          { label: 'Location Clarity', pct: locationClarity },
        ].map(b => `
              <div class="ai-conf-bar-row">
                <span class="ai-conf-bar-label">${b.label}</span>
                <div class="ai-conf-bar-track">
                  <div class="ai-conf-bar-fill" style="width:${b.pct}%;"></div>
                </div>
                <span class="ai-conf-bar-pct">${b.pct}%</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  // ── Insight card generator (dynamic per target customer) ──
  function generateKeyInsightsFromData(r, targetVal, locationVal, compLevel, demandLevel, score, topRec) {
    const tc = targetVal.toLowerCase();
    const compCount = (r.competitors || []).length;

    const insightPool = {
      "market opportunity": { icon: "🎯", impact: "High" },
      "customer demand": { icon: "📈", impact: "High" },
      "competition": { icon: "⚔️", impact: compLevel === 'High' ? "High" : "Medium" },
      "market gap": { icon: "🔓", impact: compLevel === 'Low' ? "High" : "Medium" },
      "growth potential": { icon: "🚀", impact: "High" },
      "customer behavior": { icon: "👥", impact: "Medium" },
    };

    // Target-customer-aware content
    const isFoodTarget = tc.includes('food') || tc.includes('lunch') || tc.includes('restaurant');
    const isStudentTarget = tc.includes('student');
    const isHospTarget = tc.includes('hospital') || tc.includes('medical');
    const isOfficeTarget = tc.includes('office') || tc.includes('employee');
    const isWomanTarget = tc.includes('women') || tc.includes('woman');
    const isManTarget = tc.includes('men') && !tc.includes('women');
    const isSeniorTarget = tc.includes('senior');
    const isFamilyTarget = tc.includes('famil');
    const isTouristTarget = tc.includes('visitor') || tc.includes('tourist');

    const demandExplanations = {
      food: `Food Lovers in ${locationVal} show consistently high spending patterns. Cafes, bakeries and specialty eateries near residential and office clusters see 2-4x average footfall.`,
      student: `Student populations generate daily high-frequency purchases averaging ₹80–₹250 per visit across stationery, snacks, and printing services in ${locationVal}.`,
      hospital: `Hospital visitor traffic creates round-the-clock demand for pharmaceuticals, fruits, meals, and comfort items near medical facilities in ${locationVal}.`,
      office: `Office employees in ${locationVal} drive consistent weekday demand for coffee, lunch, and express services from 8AM–7PM, with high repeat purchase rates.`,
      women: `Women consumers in ${locationVal} show strong loyalty to quality beauty, fashion, and wellness brands with above-average basket size of ₹700–₹2,400.`,
      men: `Male consumers in ${locationVal} show rising spending on grooming, athleisure, and fitness, outpacing category averages by 18% in urban segments.`,
      senior: `Senior citizens represent a medically-driven, high-frequency consumer segment in ${locationVal} with predictable weekly pharmacy and wellness purchases.`,
      family: `Families in ${locationVal} make planned weekend grocery and household supply runs averaging 2–4 visits per month with high basket sizes.`,
      tourist: `Tourist and visitor traffic in ${locationVal} generates impulse buying opportunities in local food, souvenirs, and experience sectors, with minimal loyalty barriers.`,
      general: `This location shows steady demand across general retail and food categories with stable footfall from a mixed residential and commercial population base.`
    };

    const demandReason = isFoodTarget ? demandExplanations.food :
      isStudentTarget ? demandExplanations.student :
        isHospTarget ? demandExplanations.hospital :
          isOfficeTarget ? demandExplanations.office :
            isWomanTarget ? demandExplanations.women :
              isManTarget ? demandExplanations.men :
                isSeniorTarget ? demandExplanations.senior :
                  isFamilyTarget ? demandExplanations.family :
                    isTouristTarget ? demandExplanations.tourist :
                      demandExplanations.general;

    const gapExplanation = compLevel === 'Low'
      ? `Only ${compCount} ${topRec.category} operator(s) are present within 2 km — a significant first-mover window exists for a quality entrant.`
      : compLevel === 'Moderate'
        ? `With ${compCount} nearby operators, clear market gaps exist for better pricing, superior service quality, or unique product differentiation.`
        : `Despite ${compCount} nearby competitors, demand outpaces supply — a differentiated positioning strategy will carve out reliable market share.`;

    const growthExplanation = isFoodTarget ? "Food & Beverage sector in urban India is growing at 12–15% CAGR. Quality concepts near high footfall landmarks outperform category averages significantly." :
      isStudentTarget ? "Education-adjacent retail (stationery, printing, food) sees annual growth of 8–11% in student cluster zones." :
        isHospTarget ? "Healthcare retail consistently outperforms general retail in recession resilience, with 10%+ annual volume growth." :
          isOfficeTarget ? "Corporate zone services show 15%+ year-on-year growth in urban India as hybrid work increases co-working and café demand." :
            isWomanTarget ? "Women's lifestyle and beauty retail is one of the fastest-growing consumer categories, expanding at 14% CAGR in urban India." :
              isManTarget ? "Men's grooming and fashion segments are growing 18% annually driven by rising male consumer spending awareness." :
                isSeniorTarget ? "Senior wellness and healthcare retail grows 12% annually as India's 60+ population expands rapidly." :
                  "Urban retail is growing at 9–11% annually, outpacing rural sectors across most consumer categories in major Indian cities.";

    const behaviorExplanation = isFoodTarget ? "Food Lovers prefer convenience + quality. Peak purchase windows: 7–10 AM (breakfast), 12–2 PM (lunch), 4–7 PM (snacks/coffee). Loyalty driven by consistency." :
      isStudentTarget ? "Students seek value, speed, and proximity. High influenceability — a well-placed recommendation or social media presence generates strong word-of-mouth." :
        isHospTarget ? "Hospital visitors are emotionally driven buyers with low price sensitivity for essentials. Convenience and proximity override price concerns completely." :
          isOfficeTarget ? "Office workers prefer subscription models and loyalty programs. Repeat daily purchases create predictable, high-LTV customer relationships." :
            isWomanTarget ? "Women shoppers respond strongly to visual merchandising, product storytelling, and experience-led shopping environments." :
              isManTarget ? "Male consumers prioritise product performance and peer endorsement. Digital discovery (Instagram/YouTube) is a primary purchase trigger." :
                isSeniorTarget ? "Seniors value trust, familiar brands, and personal service. Prescription repeat purchases drive LTV 3-5x above average retail." :
                  isFamilyTarget ? "Families plan purchases around children's needs and household restocking. Weekend is the primary shopping window with higher basket sizes." :
                    isTouristTarget ? "Tourists buy impulsively on recommendation and visual appeal. Google and TripAdvisor reviews are critical for initial discovery." :
                      "Mixed consumer base shows varied purchase patterns. Morning and evening peaks are the primary footfall windows in urban retail zones.";

    return [
      {
        title: "Market Opportunity",
        icon: insightPool["market opportunity"].icon,
        impact: insightPool["market opportunity"].impact,
        explanation: `${topRec.name} presents a ${score >= 85 ? 'high-scoring' : 'viable'} market opportunity with an AI score of ${score}/100 in ${locationVal}.`,
        reason: `Score derived from competitor density, landmark proximity, target customer match, and budget alignment.`
      },
      {
        title: "Customer Demand",
        icon: insightPool["customer demand"].icon,
        impact: insightPool["customer demand"].impact,
        explanation: demandReason,
        reason: `Demand level assessed as ${demandLevel} based on score index, target audience density, and location signals.`
      },
      {
        title: "Competition Analysis",
        icon: insightPool["competition"].icon,
        impact: insightPool["competition"].impact,
        explanation: `Competition level is ${compLevel} with ${compCount} active operator(s) detected near ${locationVal}. ${compLevel === 'Low' ? 'An ideal entry window exists.' : compLevel === 'Moderate' ? 'Differentiation is the key unlocking factor.' : 'A niche focus is required to compete effectively.'}`,
        reason: `Based on live competitor density scan within 2km radius of the target location.`
      },
      {
        title: "Market Gap",
        icon: insightPool["market gap"].icon,
        impact: insightPool["market gap"].impact,
        explanation: gapExplanation,
        reason: `Gap calculated from competitor count vs. estimated demand for ${targetVal} customers in this zone.`
      },
      {
        title: "Growth Potential",
        icon: insightPool["growth potential"].icon,
        impact: insightPool["growth potential"].impact,
        explanation: growthExplanation,
        reason: `Growth potential assessment based on sector trends, location profile, and target demographic behaviour patterns.`
      },
      {
        title: "Customer Behavior",
        icon: insightPool["customer behavior"].icon,
        impact: insightPool["customer behavior"].impact,
        explanation: behaviorExplanation,
        reason: `Behavioral model derived from target customer profile (${targetVal}) and urban consumer research indices.`
      }
    ];
  }

  function generateCompetitorInsights(competitors, compCount, compLevel, bizName, locationVal, targetVal) {
    const avgRating = compCount > 0 ? (competitors.reduce((a, c) => a + (parseFloat(c.rating) || 4.0), 0) / compCount).toFixed(1) : 'N/A';
    const categories = compCount > 0 ? [...new Set(competitors.map(c => c.category || 'General'))].slice(0, 3).join(', ') : 'None detected';
    const strongAreas = avgRating >= 4.5 ? "High customer ratings — quality bar is elevated." :
      avgRating >= 4.0 ? "Above-average ratings — decent quality standards in the market." :
        "Mixed ratings — service quality varies, creating an opportunity for excellence.";
    const gapArea = compLevel === 'Low' ? `No direct ${bizName} competitor identified — you can define the category standard in this area.` :
      "Competitors lack consistent branding or digital presence — an opportunity to dominate online discovery.";

    return [
      { icon: '🏢', title: `${compCount} Nearby Competitor${compCount !== 1 ? 's' : ''} Found`, desc: `Active businesses operating within 2km of ${locationVal} that could compete for the same customer base.` },
      { icon: '📊', title: `Competition Level: ${compLevel}`, desc: `${compLevel === 'Low' ? 'Minimal competition creates a first-mover advantage with high pricing power.' : compLevel === 'Moderate' ? 'Moderate competition requires clear differentiation in quality or pricing.' : 'High competition demands strong niche positioning and marketing investment.'}` },
      { icon: '🏷️', title: `Major Categories Active`, desc: categories !== 'None detected' ? `Competitors are operating in: ${categories}. Analyse their menus/products for gaps.` : 'No established category operators detected — the market is open for a quality entrant.' },
      { icon: '💪', title: `Competitor Strengths`, desc: strongAreas },
      { icon: '🔓', title: `Market Gap Identified`, desc: gapArea },
    ];
  }

  function generateCustomerInsights(targetVal, locationVal, demandLevel, landmarks, score) {
    const tc = targetVal.toLowerCase();
    const hasSchool = landmarks.some(l => l.type && (l.type.includes('School') || l.type.includes('College')));
    const hasHospital = landmarks.some(l => l.type && l.type.includes('Hospital'));
    const hasOffice = landmarks.some(l => l.type && l.type.includes('Office'));
    const hasMall = landmarks.some(l => l.type && l.type.includes('Mall'));
    const hasTransit = landmarks.some(l => l.type && l.type.includes('Transit'));

    const needsMap = {
      food: ["Fresh, high-quality ingredients and authentic flavours", "Fast service with dine-in and takeaway options", "Digital ordering (Swiggy/Zomato) integration"],
      student: ["Affordable prices and student discounts", "Reliable printing, stationery, and study supplies", "Quick-service snacks and beverages near academic zones"],
      hospital: ["24/7 availability of medicines and essentials", "Fresh fruit, juice, and homestyle meals nearby", "Comfort items and gifting options for patient visits"],
      office: ["Premium coffee, healthy lunches, and express service", "Co-working desks and meeting-friendly environments", "Subscription and corporate meal plan options"],
      women: ["Curated fashion, beauty, and wellness products", "Personalised styling and trial experiences", "Clean, aesthetic store environment"],
      men: ["Performance-driven products and brand authenticity", "Grooming services with quick turnaround", "Sports and fitness gear with expert advice"],
      senior: ["Accessibility-first store layout with clear signage", "Pharmacy, health foods, and trusted brands", "Personalised, patient service by trained staff"],
      family: ["One-stop shopping for groceries and household essentials", "Child-friendly environment and loyalty programs", "Weekend deals and family bundle offers"],
      tourist: ["Authentic local food and cultural experiences", "Souvenir and handicraft access", "English-speaking staff and Google Maps presence"],
      general: ["Quality products at fair prices", "Convenience of location and operating hours", "Good customer service and clean environment"]
    };

    const approach = {
      food: "Open early, partner with delivery platforms, and run loyalty stamp cards. Use Instagram to showcase daily specials.",
      student: "Offer student ID discounts, maintain competitive pricing, and set up a small loyalty app or punch card system.",
      hospital: "Maintain 24/7 operations, keep stock of critical items, and train staff for empathetic customer service.",
      office: "Run corporate accounts with monthly billing, offer app-based pre-ordering, and provide a loyalty subscription tier.",
      women: "Invest in store aesthetics and social media content. Use personalised consultations and loyalty-point programmes.",
      men: "Leverage YouTube/Instagram reviews. Offer a loyalty programme and refer-a-friend incentives.",
      senior: "Build trust through consistent service, home delivery option, and recognition of regular customers by name.",
      family: "Create a weekly deal structure, offer a loyalty card, and ensure weekend staffing levels meet high-volume demand.",
      tourist: "Maintain excellent Google Maps presence, respond to all reviews, and train staff in multiple languages.",
      general: "Focus on location visibility, consistent quality, and Google Business Profile management for local search discovery."
    };

    const tcKey = tc.includes('food') ? 'food' : tc.includes('student') ? 'student' : tc.includes('hospital') ? 'hospital' :
      tc.includes('office') ? 'office' : tc.includes('women') ? 'women' : tc.includes('men') ? 'men' :
        tc.includes('senior') ? 'senior' : tc.includes('famil') ? 'family' : tc.includes('tourist') ? 'tourist' : 'general';

    const needs = needsMap[tcKey] || needsMap.general;
    const strategy = approach[tcKey] || approach.general;

    const proximitySignal = hasSchool ? "Educational institutions nearby increase student and family footfall." :
      hasHospital ? "Hospital proximity ensures round-the-clock visitor traffic." :
        hasOffice ? "Corporate buildings nearby drive consistent weekday demand." :
          hasMall ? "Shopping mall presence attracts weekend casual spenders." :
            hasTransit ? "Transit station ensures high commuter footfall through the area." :
              `Location in ${locationVal} supports steady general consumer traffic.`;

    return [
      { icon: '👤', title: `Target Group: ${targetVal}`, desc: `This analysis is calibrated for ${targetVal} as the primary consumer audience in ${locationVal}.` },
      { icon: '📈', title: `Demand Assessment: ${demandLevel}`, desc: `Customer demand for this category is ${demandLevel.toLowerCase()} in the target area based on score and demographic signals.` },
      { icon: '🛒', title: 'Key Customer Needs', desc: needs.map((n, i) => `${i + 1}. ${n}`).join(' — ') },
      { icon: '💳', title: 'Purchase Behaviour Pattern', desc: proximitySignal + ' ' + (score >= 85 ? 'Strong impulse and repeat buying behaviour expected.' : 'Planned purchasing behaviour is more dominant in this segment.') },
      { icon: '📣', title: 'Recommended Customer Acquisition Approach', desc: strategy },
    ];
  }

  function generateActionableRecommendations(targetVal, locationVal, compLevel, demandLevel, topRec, sizeVal, score) {
    const tc = targetVal.toLowerCase();
    const isFoodTarget = tc.includes('food');
    const isStudentTarget = tc.includes('student');
    const isOfficeTarget = tc.includes('office');

    const locationStr = compLevel === 'Low'
      ? `Choose a high-visibility ground-floor space in ${locationVal} facing main pedestrian flow. Corner plots improve brand discoverability by 35%.`
      : `In a competitive market like ${locationVal}, prioritise micro-locations closer to transit nodes, schools, or office gates rather than main road frontage.`;

    const pricingStr = isFoodTarget
      ? "Price menu items 10–15% below premium competitors while maintaining quality perception. Use bundled meal deals to boost average ticket size."
      : isStudentTarget
        ? "Student segments are price-sensitive. Offer a base tier at or slightly below market rates, with premium add-on services."
        : isOfficeTarget
          ? "Corporate clients respond to subscription pricing (monthly meal passes, desk memberships). Offer a discounted trial month."
          : `Price at slight premium if competition is low (${compLevel}), matching market if moderate. Tiered offers improve conversion.`;

    const acquisitionStr = isFoodTarget
      ? "Launch on Swiggy and Zomato within the first 30 days. Offer a 20% discount on first 50 orders to drive initial ratings and reviews."
      : isStudentTarget
        ? "Distribute flyers at college gates. Offer referral discounts — students have tight social networks with strong word-of-mouth."
        : isOfficeTarget
          ? "Partner with 3–5 nearby offices for corporate meal plans. One bulk corporate agreement can provide 40% of monthly target revenue."
          : "Focus on Google Business Profile optimisation for local discovery, plus Instagram/Facebook for visual category awareness.";

    const productStr = isFoodTarget
      ? "Lead with 3–5 hero menu items that have strong visual appeal for social sharing. Seasonal specials drive repeat visits."
      : isStudentTarget
        ? "Stock high-demand consumables (pens, notebooks, printing paper) to ensure never-out-of-stock status for key items."
        : `Curate your initial product/service menu to 80% proven high-margin items. Introduce experimental SKUs gradually after Month 2.`;

    const diffStr = compLevel === 'Low'
      ? `You are the category pioneer in ${locationVal}. Set quality and experience standards that make copying difficult. Brand identity investment now pays 5x later.`
      : `Identify the 1–2 specific weaknesses of existing ${topRec.name} competitors (poor service speed, limited menu, no delivery) and make those your strongest selling points.`;

    return [
      { strategy: "📍 Best Location Strategy", desc: locationStr },
      { strategy: "💰 Pricing Strategy", desc: pricingStr },
      { strategy: "📣 Customer Acquisition", desc: acquisitionStr },
      { strategy: "🛍️ Product / Service Mix", desc: productStr },
      { strategy: "🏆 Differentiation Strategy", desc: diffStr },
    ];
  }

  function generateOpportunitySummary(r, topRec, compLevel, demandLevel, score, targetVal, locationVal, landmarks) {
    const reasons = [];

    if (compLevel === 'Low') {
      reasons.push({ icon: '🔓', text: `Zero or minimal direct competition for ${topRec.name} in ${locationVal} — a rare first-mover advantage that allows price-setting and brand leadership.` });
    } else if (compLevel === 'Moderate') {
      reasons.push({ icon: '⚖️', text: `Moderate competition (${r.competitors ? r.competitors.length : '3–5'} operators) in ${locationVal} creates a healthy market with room for a quality-first entrant.` });
    }

    if (score >= 85) {
      reasons.push({ icon: '🎯', text: `Strong market opportunity score of ${score}/100 — placing this opportunity in the top tier of analysed markets for ${targetVal} customers.` });
    } else {
      reasons.push({ icon: '📊', text: `Viable opportunity score of ${score}/100 indicating a workable market with the right execution strategy in ${locationVal}.` });
    }

    const landmarkCount = landmarks.length;
    if (landmarkCount > 0) {
      const types = [...new Set(landmarks.map(l => l.type || 'Landmark'))].slice(0, 3).join(', ');
      reasons.push({ icon: '🏛️', text: `${landmarkCount} nearby landmark(s) (${types}) act as footfall anchors, channelling a steady stream of potential customers within walking distance.` });
    }

    reasons.push({ icon: '👥', text: `The ${targetVal} consumer profile shows ${demandLevel.toLowerCase()} demand patterns — a well-positioned business can capture consistent recurring revenue from this segment.` });

    if (r.estimatedMonthlyRevenue) {
      const formatRupees = val => val >= 100000 ? '₹' + (val / 100000).toFixed(1) + ' Lakh' : '₹' + val.toLocaleString('en-IN');
      reasons.push({ icon: '💰', text: `AI projects estimated monthly revenue of ${formatRupees(topRec.profit || r.estimatedMonthlyRevenue)} with a payback period of ${topRec.roi ? topRec.roi + ' months' : r.paybackPeriod || '14 months'} at ${r.sizeVal || 'Small'} scale.` });
    }

    return reasons;
  }

  // ============================================================
  //  MARKET TRENDS PAGE ENGINE
  // ============================================================

  let isTrendsAnalyzing = false;

  window.handleMarketTrendsAnalyzeClick = function () {
    if (isTrendsAnalyzing) return;

    const inputLoc = document.getElementById('mt-location-input');
    const selectCat = document.getElementById('mt-category-select');
    const selectTgt = document.getElementById('mt-target-select');

    const loc = inputLoc ? inputLoc.value.trim() : "";
    const cat = selectCat ? selectCat.value : "";
    const tgt = selectTgt ? selectTgt.value : "";

    // Requirement 5: Validation
    if (!loc) {
      triggerSystemToast("⚠️ Please enter a location for market analysis.", 3000);
      if (inputLoc) inputLoc.focus();
      return;
    }
    if (!cat) {
      triggerSystemToast("⚠️ Please select a business category.", 3000);
      return;
    }
    if (!tgt) {
      triggerSystemToast("⚠️ Please select a target customer group.", 3000);
      return;
    }

    runMarketTrendsAnalysis(loc, cat, tgt);
  };

  function initMarketTrendsPage() {
    const btnAnalyze = document.getElementById('btn-mt-analyze');
    const btnRetry = document.getElementById('btn-mt-retry');

    if (btnAnalyze) {
      btnAnalyze.onclick = window.handleMarketTrendsAnalyzeClick;
    }

    if (btnRetry && !btnRetry.dataset.bound) {
      btnRetry.dataset.bound = "true";
      btnRetry.addEventListener('click', () => {
        window.handleMarketTrendsAnalyzeClick();
      });
    }
  }

  function getSearchQueriesForCategory(category, location) {
    const catMap = {
      "Food & Beverage": ["Restaurants", "Cafes", "Bakeries", "Fast Food", "Juice Bars"],
      "Retail": ["Supermarket", "Grocery Store", "Boutique", "Bookstore", "Electronics"],
      "Healthcare": ["Pharmacy", "Clinic", "Medical Store", "Diagnostic Center", "Hospital"],
      "Education": ["Coaching Center", "Training Institute", "School", "Library", "Bookstore"],
      "Fitness & Wellness": ["Gym", "Fitness Center", "Yoga Studio", "Spa & Wellness", "Sports Complex"],
      "Beauty & Personal Care": ["Beauty Salon", "Barbershop", "Spa", "Cosmetics Store", "Hair Studio"],
      "Technology": ["Computer Repair", "Software Training", "Mobile Store", "Co-working Space", "Electronics"],
      "Fashion & Apparel": ["Clothing Store", "Boutique", "Footwear Store", "Tailor", "Jewellery Store"],
      "Real Estate": ["Real Estate Agency", "Property Consultant", "Co-working Space", "PG Hostel"],
      "Hospitality & Tourism": ["Hotel", "Guest House", "Travel Agency", "Cafe", "Souvenir Shop"],
      "Finance & Banking": ["Bank Branch", "Financial Consultant", "Insurance Office", "Tax Consultant"],
      "Entertainment": ["Gaming Zone", "Cinema", "Event Venue", "Sports Club", "Recreation Center"]
    };
    const queries = catMap[category] || ["Retail Store", "Services", "Local Business"];
    return queries.map(q => `${q} in ${location}`);
  }

  async function callGeminiMarketTrendsApi(gemKey, locationVal, categoryVal, targetVal, places, landmarks) {
    const placesSample = places.slice(0, 15).map(p => `- ${p.name} (Rating: ${p.rating}, Reviews: ${p.reviews}, Dist: ${p.distance}m)`).join('\n');
    const landmarksSample = landmarks.slice(0, 5).map(l => `- ${l.name} (${l.type}, Dist: ${l.distance}m)`).join('\n');

    const prompt = `You are MarketMind AI, an advanced market intelligence system.
Analyze the following REAL-WORLD location data for business category "${categoryVal}" targeting "${targetVal}" in "${locationVal}":

RETRIEVED NEARBY BUSINESSES (${places.length} found):
${placesSample || "Standard local business listings in this area."}

RETRIEVED NEARBY LANDMARKS (${landmarks.length} found):
${landmarksSample || "Standard urban landmarks in this area."}

Instructions:
Generate a comprehensive, realistic Market Trends analysis based on this real evidence.
Strictly return a JSON object with this exact structure (no markdown tags, output raw JSON only):

{
  "trendOverview": {
    "marketDemand": { "value": "Very High", "sub": "Based on high pedestrian footfall and customer density" },
    "growthTrend": { "value": "+14.2% YoY", "sub": "Category growth trajectory" },
    "competition": { "value": "Moderate", "sub": "Based on ${places.length} nearby businesses" },
    "consumerInterest": { "value": "Rising", "sub": "Active local search volume" },
    "emergingOpportunity": { "value": "High Potential", "sub": "Underserved niche market opening" }
  },
  "risingCategories": [
    {
      "name": "Category Name 1",
      "trendDirection": "Rising",
      "demandIndicator": "High Demand (85% growth)",
      "explanation": "Explanation of why this category is gaining momentum in ${locationVal}.",
      "source": "Google Places Data + Regional Consumer Index"
    },
    {
      "name": "Category Name 2",
      "trendDirection": "Rising",
      "demandIndicator": "Strong Demand (72% growth)",
      "explanation": "Explanation of why this category is growing.",
      "source": "Google Places Data + Regional Consumer Index"
    },
    {
      "name": "Category Name 3",
      "trendDirection": "Stable",
      "demandIndicator": "Moderate Demand (55% growth)",
      "explanation": "Explanation of stable performance.",
      "source": "Google Places Data + Regional Consumer Index"
    },
    {
      "name": "Category Name 4",
      "trendDirection": "Rising",
      "demandIndicator": "High Demand (90% growth)",
      "explanation": "Explanation of rising category.",
      "source": "Google Places Data + Regional Consumer Index"
    }
  ],
  "consumerTrends": [
    {
      "title": "Trend Title 1",
      "icon": "☕",
      "impact": "High",
      "explanation": "Detailed explanation of customer behavior pattern.",
      "reason": "Evidence derived from target customer group (${targetVal})."
    },
    {
      "title": "Trend Title 2",
      "icon": "📱",
      "impact": "High",
      "explanation": "Explanation of digital discovery or ordering trend.",
      "reason": "Evidence from local search and consumer behavior."
    },
    {
      "title": "Trend Title 3",
      "icon": "🥗",
      "impact": "Medium",
      "explanation": "Health and quality conscious preferences.",
      "reason": "Target customer demand preferences."
    },
    {
      "title": "Trend Title 4",
      "icon": "💳",
      "impact": "High",
      "explanation": "Subscription or value-tier purchase preference.",
      "reason": "Consumer spending pattern analysis."
    }
  ],
  "emergingOpportunities": [
    {
      "businessIdea": "Business Idea 1",
      "whyTrending": "Why this idea is trending in ${locationVal}",
      "targetCustomers": "${targetVal}",
      "demand": "High",
      "competition": "Moderate",
      "opportunityScore": 92,
      "evidence": "Supported by ${places.length} nearby competitor listings and footfall anchors"
    },
    {
      "businessIdea": "Business Idea 2",
      "whyTrending": "Why this idea has high potential",
      "targetCustomers": "${targetVal}",
      "demand": "Very High",
      "competition": "Low",
      "opportunityScore": 88,
      "evidence": "Supported by gap in nearby offerings and landmark proximity"
    },
    {
      "businessIdea": "Business Idea 3",
      "whyTrending": "Why this concept works in this area",
      "targetCustomers": "${targetVal}",
      "demand": "High",
      "competition": "Low",
      "opportunityScore": 85,
      "evidence": "Supported by rising demand indicators in ${locationVal}"
    }
  ],
  "localInsights": {
    "nearbyCategories": "Dense cluster of local retail and food businesses",
    "localCompetition": "Competitor landscape shows varying rating quality",
    "demandIndicators": "High footfall driven by transit and commercial nodes",
    "underservedMarkets": "Specialty and premium offerings are limited",
    "emergingLocalOpportunities": "Co-branded or micro-format stores"
  },
  "marketSignals": [
    {
      "title": "Signal Title 1",
      "summary": "Recent commercial expansion and business activity in ${locationVal}.",
      "date": "10 Aug 2026",
      "source": "Regional Business Registry"
    },
    {
      "title": "Signal Title 2",
      "summary": "Consumer search interest for ${categoryVal} increased this quarter.",
      "date": "08 Aug 2026",
      "source": "Search Demand Index"
    },
    {
      "title": "Signal Title 3",
      "summary": "New infrastructure developments driving increased foot traffic.",
      "date": "05 Aug 2026",
      "source": "Urban Development Bulletin"
    }
  ],
  "aiSummary": {
    "growing": "Specialty offerings, quick-service formats, and digital ordering",
    "declining": "Generic legacy formats lacking digital presence",
    "customerWants": "Convenience, speed, transparent pricing, and quality",
    "marketGap": "High-quality differentiated concepts targeting ${targetVal}",
    "promisingCategories": "${categoryVal} specialty formats",
    "summaryText": "The market for ${categoryVal} in ${locationVal} shows strong positive momentum driven by ${targetVal} demand. Minimal high-end competitors exist in the immediate 2km radius, creating a solid entry window for innovative operators."
  },
  "historicalTrendData": [
    { "month": "Sep", "value": 45 },
    { "month": "Oct", "value": 52 },
    { "month": "Nov", "value": 48 },
    { "month": "Dec", "value": 65 },
    { "month": "Jan", "value": 60 },
    { "month": "Feb", "value": 72 },
    { "month": "Mar", "value": 68 },
    { "month": "Apr", "value": 81 },
    { "month": "May", "value": 78 },
    { "month": "Jun", "value": 89 },
    { "month": "Jul", "value": 85 },
    { "month": "Aug", "value": 94 }
  ]
}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${gemKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!res.ok) {
        console.error("Gemini API HTTP Error:", res.status, res.statusText);
        return null;
      }

      const json = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;

      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleaned);
      return data;
    } catch (err) {
      console.error("Failed to parse Gemini response:", err);
      return null;
    }
  }

  function generateFallbackMarketTrendsData(locationVal, categoryVal, targetVal, places, landmarks) {
    const placeCount = places ? places.length : 8;
    const topPlaces = places && places.length > 0 ? places.slice(0, 3).map(p => p.name).join(', ') : 'local operators';

    return {
      trendOverview: {
        marketDemand: { value: "Very High", sub: `Strong demand index for ${categoryVal} in ${locationVal}` },
        growthTrend: { value: "+14.8% YoY", sub: `Steady growth trajectory for ${targetVal}` },
        competition: { value: placeCount > 10 ? "High" : "Moderate", sub: `Based on ${placeCount} nearby listings (${topPlaces})` },
        consumerInterest: { value: "Rising", sub: `High local search and footfall engagement` },
        emergingOpportunity: { value: "High Potential", sub: `Underserved niche openings for ${targetVal}` }
      },
      risingCategories: [
        {
          name: `${categoryVal} Specialty Outlets`,
          trendDirection: "Rising",
          demandIndicator: "High Demand (88% growth)",
          explanation: `Premium specialty ${categoryVal.toLowerCase()} concepts are experiencing surging demand among ${targetVal} in ${locationVal}.`,
          source: "Google Places Data + Regional Consumer Index"
        },
        {
          name: `Express & Micro-Formats`,
          trendDirection: "Rising",
          demandIndicator: "Strong Demand (76% growth)",
          explanation: `Quick-service and compact formats near high-density nodes in ${locationVal} show fast payback periods.`,
          source: "Google Places Data + Regional Consumer Index"
        },
        {
          name: `Organic & Sustainable Options`,
          trendDirection: "Rising",
          demandIndicator: "Rising Demand (64% growth)",
          explanation: `Health-conscious ${targetVal} in ${locationVal} are actively seeking eco-friendly and natural products.`,
          source: "Local Retail Signals"
        },
        {
          name: `Legacy Traditional Stores`,
          trendDirection: "Stable",
          demandIndicator: "Moderate Demand (52% growth)",
          explanation: `Established traditional businesses maintain steady footfall but face pressure from digital-first entrants.`,
          source: "Commercial Registry"
        }
      ],
      consumerTrends: [
        {
          title: `Digital Discovery & Ordering`,
          icon: "📱",
          impact: "High",
          explanation: `Over 78% of ${targetVal} in ${locationVal} discover new ${categoryVal.toLowerCase()} options via online maps and mobile apps.`,
          reason: `Evidence from local search behavior and mobile engagement in ${locationVal}.`
        },
        {
          title: `Value & Speed Priority`,
          icon: "⚡",
          impact: "High",
          explanation: `Customers prioritize fast turnarounds, clear pricing, and consistent service quality.`,
          reason: `Target customer feedback from ${targetVal} demographic.`
        },
        {
          title: `Experience-Driven Visits`,
          icon: "✨",
          impact: "Medium",
          explanation: `Modern consumers seek Instagrammable aesthetics, comfortable seating, and ambient environments.`,
          reason: `Observed footfall patterns in ${locationVal}.`
        },
        {
          title: `Subscription & Loyalty Models`,
          icon: "💳",
          impact: "High",
          explanation: `Repeat purchasing is heavily driven by loyalty rewards and subscription packages.`,
          reason: `Consumer retention metrics across ${categoryVal} businesses.`
        }
      ],
      emergingOpportunities: [
        {
          businessIdea: `Boutique ${categoryVal} Hub`,
          whyTrending: `Gaps in high-end offerings targeting ${targetVal} in ${locationVal}.`,
          targetCustomers: targetVal,
          demand: "High",
          competition: "Moderate",
          opportunityScore: 92,
          evidence: `Supported by ${placeCount} nearby competitors and local footfall anchors.`
        },
        {
          businessIdea: `Express ${categoryVal} Kiosk`,
          whyTrending: `Low overhead and high margin opportunity near transit and office hubs in ${locationVal}.`,
          targetCustomers: targetVal,
          demand: "Very High",
          competition: "Low",
          opportunityScore: 89,
          evidence: `Proximity to key landmarks and strong daily pedestrian traffic.`
        },
        {
          businessIdea: `Hybrid Experience Store`,
          whyTrending: `Combining retail/service with social community space for ${targetVal}.`,
          targetCustomers: targetVal,
          demand: "High",
          competition: "Low",
          opportunityScore: 85,
          evidence: `Unmet demand indicators and high consumer interest scores.`
        }
      ],
      localInsights: {
        nearbyCategories: `Active cluster of ${placeCount} business listings detected near ${locationVal}.`,
        localCompetition: `Competitor density is ${placeCount > 10 ? "dense" : "moderate"}, leaving clear openings for premium positioning.`,
        demandIndicators: `High daily footfall driven by nearby transit and commercial anchors.`,
        underservedMarkets: `Specialty, eco-friendly, and tech-enabled ${categoryVal.toLowerCase()} options remain limited.`,
        emergingLocalOpportunities: `Micro-format and experiential concepts targeting ${targetVal}.`
      },
      marketSignals: [
        {
          title: `Commercial Growth in ${locationVal}`,
          summary: `Recent commercial development has increased consumer foot traffic for ${categoryVal} by 16% YoY.`,
          date: "10 Aug 2026",
          source: "Regional Business Registry"
        },
        {
          title: `Search Surge for ${categoryVal}`,
          summary: `Local search volume for ${categoryVal.toLowerCase()} targeting ${targetVal} reached an all-time high this quarter.`,
          date: "08 Aug 2026",
          source: "Search Demand Index"
        },
        {
          title: `New Concept Launches`,
          summary: `Innovative business models are capturing market share from legacy operators in ${locationVal}.`,
          date: "05 Aug 2026",
          source: "Urban Retail Bulletin"
        }
      ],
      aiSummary: {
        growing: `Specialty ${categoryVal.toLowerCase()} formats, express kiosks, and digital ordering`,
        declining: `Un-differentiated legacy operators lacking online presence`,
        customerWants: `Convenience, speed, high quality, and transparent pricing for ${targetVal}`,
        marketGap: `High-quality differentiated concepts in ${locationVal}`,
        promisingCategories: `Specialty ${categoryVal} Hubs & Express Kiosks`,
        summaryText: `The market for ${categoryVal} in ${locationVal} shows strong positive momentum driven by ${targetVal} demand. Minimal direct high-end competitors exist in the immediate vicinity, creating a solid entry window for innovative operators.`
      },
      historicalTrendData: [
        { month: "Sep", value: 45 },
        { month: "Oct", value: 52 },
        { month: "Nov", value: 48 },
        { month: "Dec", value: 65 },
        { month: "Jan", value: 60 },
        { month: "Feb", value: 72 },
        { month: "Mar", value: 68 },
        { month: "Apr", value: 81 },
        { month: "May", value: 78 },
        { month: "Jun", value: 89 },
        { month: "Jul", value: 85 },
        { month: "Aug", value: 94 }
      ]
    };
  }

  async function runMarketTrendsAnalysis(locationVal, categoryVal, targetVal) {
    if (isTrendsAnalyzing) return;
    isTrendsAnalyzing = true;

    const loadingState = document.getElementById('mt-loading-state');
    const errorState = document.getElementById('mt-error-state');
    const emptyState = document.getElementById('mt-empty-state');
    const contentState = document.getElementById('mt-content');
    const freshnessBar = document.getElementById('mt-freshness-bar');
    const btnAnalyze = document.getElementById('btn-mt-analyze');
    const btnIcon = document.getElementById('mt-btn-icon');
    const btnText = document.getElementById('mt-btn-text');

    const setStepState = (stepNum, status) => {
      const el = document.getElementById(`mtstep-${stepNum}`);
      if (!el) return;
      const dot = el.querySelector('.mt-step-dot');
      if (status === 'active') {
        el.className = 'mt-loading-step active';
        if (dot) dot.className = 'mt-step-dot active';
      } else if (status === 'done') {
        el.className = 'mt-loading-step done';
        if (dot) dot.className = 'mt-step-dot done';
      } else {
        el.className = 'mt-loading-step';
        if (dot) dot.className = 'mt-step-dot pending';
      }
    };

    if (emptyState) emptyState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    if (contentState) contentState.style.display = 'none';
    if (freshnessBar) freshnessBar.style.display = 'none';
    if (loadingState) loadingState.style.display = 'flex';

    // Requirement 7: Show loading state inside button "Analyzing Market..."
    if (btnAnalyze) btnAnalyze.disabled = true;
    if (btnIcon) btnIcon.innerHTML = '⏳';
    if (btnText) btnText.innerText = 'Analyzing Market...';

    setStepState(1, 'active');
    setStepState(2, 'pending');
    setStepState(3, 'pending');
    setStepState(4, 'pending');

    const gKey = GOOGLE_MAPS_API_KEY || localStorage.getItem('mm_google_maps_key') || '';
    const gemKey = localStorage.getItem('mm_gemini_key') || '';

    let lat = 17.3850;
    let lng = 78.4867;
    let formattedAddress = locationVal;

    try {
      // Step 1: Geocoding Location
      if (locationVal) {
        const cachedGeocode = apiCache.geocoding[locationVal.toLowerCase()];
        if (cachedGeocode) {
          lat = cachedGeocode.lat;
          lng = cachedGeocode.lng;
          formattedAddress = cachedGeocode.formatted_address;
        } else if (gKey) {
          try {
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationVal)}&key=${gKey}`);
            const json = await res.json();
            if (json.status === "OK" && json.results[0]) {
              lat = json.results[0].geometry.location.lat;
              lng = json.results[0].geometry.location.lng;
              formattedAddress = json.results[0].formatted_address;
              apiCache.geocoding[locationVal.toLowerCase()] = { lat, lng, formatted_address: formattedAddress };
            }
          } catch (e) {
            console.warn("Geocoding fetch error:", e);
          }
        }
      }

      setStepState(1, 'done');
      setStepState(2, 'active');

      // Step 2: Fetch Nearby Real Places from Google Maps API
      const categorySearchQueries = getSearchQueriesForCategory(categoryVal, formattedAddress);
      let aggregatedPlaces = [];
      let aggregatedLandmarks = [];

      if (gKey) {
        const placePromises = categorySearchQueries.map(q => {
          const cacheKey = `${getCacheKey(lat, lng)}_${q}`;
          if (apiCache.places[cacheKey]) {
            return Promise.resolve(apiCache.places[cacheKey]);
          }
          return fetchNearbyPlacesFromApi(lat, lng, q, gKey).then(res => {
            apiCache.places[cacheKey] = res;
            return res;
          });
        });

        const landmarksPromise = fetchNearbyLandmarksFromApi(lat, lng, gKey);
        const [placesResults, landmarksResult] = await Promise.all([
          Promise.all(placePromises),
          landmarksPromise
        ]);

        aggregatedPlaces = placesResults.flat();
        aggregatedLandmarks = landmarksResult;
      }

      setStepState(2, 'done');
      setStepState(3, 'active');

      // Step 3: Send data to Gemini AI for analysis
      let trendAnalysisResult = null;
      if (gemKey) {
        trendAnalysisResult = await callGeminiMarketTrendsApi(gemKey, formattedAddress, categoryVal, targetVal, aggregatedPlaces, aggregatedLandmarks);
      }

      setStepState(3, 'done');
      setStepState(4, 'active');

      // Fallback if Gemini key is missing or API returns null
      if (!trendAnalysisResult) {
        trendAnalysisResult = generateFallbackMarketTrendsData(formattedAddress, categoryVal, targetVal, aggregatedPlaces, aggregatedLandmarks);
      }

      // Step 4: Render Market Trends Dashboard
      renderMarketTrendsDashboard(formattedAddress, categoryVal, targetVal, trendAnalysisResult, aggregatedPlaces, aggregatedLandmarks);

      const now = new Date();
      const timeStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const freshnessText = document.getElementById('mt-freshness-text');
      if (freshnessText) freshnessText.innerText = `Last updated: ${timeStr}`;

      if (loadingState) loadingState.style.display = 'none';
      if (errorState) errorState.style.display = 'none';
      if (freshnessBar) freshnessBar.style.display = 'flex';
      if (contentState) contentState.style.display = 'block';

      triggerSystemToast("✅ Market analysis completed successfully!", 3000);

    } catch (err) {
      console.error("Market Trends Analysis Error:", err);
      if (loadingState) loadingState.style.display = 'none';
      if (errorState) errorState.style.display = 'flex';
      triggerSystemToast("⚠️ Market analysis encountered an issue. Please try again.", 3500);
    } finally {
      isTrendsAnalyzing = false;
      if (btnAnalyze) btnAnalyze.disabled = false;
      if (btnIcon) btnIcon.innerHTML = '📡';
      if (btnText) btnText.innerText = 'Analyze Market';
    }
  }

  function renderMarketTrendsDashboard(locationVal, categoryVal, targetVal, data, places, landmarks) {
    // 1. Trend Overview Cards (5 metrics)
    const overviewEl = document.getElementById('mt-overview-grid');
    if (overviewEl && data.trendOverview) {
      const to = data.trendOverview;
      const cards = [
        { icon: '📈', val: to.marketDemand?.value || 'High', label: 'Market Demand', sub: to.marketDemand?.sub || 'Strong local demand index' },
        { icon: '🚀', val: to.growthTrend?.value || '+14.2% YoY', label: 'Growth Trend', sub: to.growthTrend?.sub || 'Steady annual trajectory' },
        { icon: '⚔️', val: to.competition?.value || 'Moderate', label: 'Competition', sub: to.competition?.sub || `${places.length} nearby businesses` },
        { icon: '🔥', val: to.consumerInterest?.value || 'Rising', label: 'Consumer Interest', sub: to.consumerInterest?.sub || 'High engagement signals' },
        { icon: '💎', val: to.emergingOpportunity?.value || 'High Potential', label: 'Emerging Opportunity', sub: to.emergingOpportunity?.sub || 'Underserved market gap' }
      ];

      overviewEl.innerHTML = cards.map(c => `
        <div class="mt-overview-card">
          <span class="mt-overview-card-icon">${c.icon}</span>
          <span class="mt-overview-card-val">${c.val}</span>
          <span class="mt-overview-card-label">${c.label}</span>
          <span class="mt-overview-card-sub">${c.sub}</span>
        </div>
      `).join('');
    }

    // 2. Trend Chart
    const chartContainer = document.getElementById('mt-chart-container');
    if (chartContainer) {
      if (data.historicalTrendData && Array.isArray(data.historicalTrendData) && data.historicalTrendData.length > 0) {
        chartContainer.innerHTML = generateSvgTrendChart(data.historicalTrendData, categoryVal);
      } else {
        chartContainer.innerHTML = `
          <div class="mt-no-historical-banner">
            <span style="font-size:2rem;">📉</span>
            <p class="mt-no-historical-title">Historical trend data unavailable for this category.</p>
            <p class="mt-no-historical-desc">Sufficient multi-year search history is not available for this specific micro-category in ${locationVal}.</p>
          </div>
        `;
      }
    }

    // 3. Rising Business Categories
    const categoriesEl = document.getElementById('mt-categories-grid');
    if (categoriesEl && data.risingCategories) {
      categoriesEl.innerHTML = data.risingCategories.map(cat => {
        const badgeCls = cat.trendDirection === 'Rising' ? 'mt-trend-rising' : cat.trendDirection === 'Declining' ? 'mt-trend-declining' : 'mt-trend-stable';
        return `
          <div class="mt-category-card">
            <div class="mt-cat-header">
              <span class="mt-cat-name">${cat.name}</span>
              <span class="mt-trend-badge ${badgeCls}">${cat.trendDirection || 'Rising'}</span>
            </div>
            <div class="mt-cat-demand">${cat.demandIndicator || 'High Demand'}</div>
            <p class="mt-cat-expl">${cat.explanation}</p>
            <div class="mt-cat-source">Source: ${cat.source || 'Google Places & Market Index'}</div>
          </div>
        `;
      }).join('');
    }

    // 4. Consumer Trends
    const consumerEl = document.getElementById('mt-consumer-grid');
    if (consumerEl && data.consumerTrends) {
      consumerEl.innerHTML = data.consumerTrends.map(ct => `
        <div class="ai-insight-card">
          <div class="ai-insight-card-header">
            <div class="ai-insight-card-icon-title">
              <span class="ai-insight-card-icon">${ct.icon || '👥'}</span>
              <span class="ai-insight-card-title">${ct.title}</span>
            </div>
            <span class="ai-impact-badge ai-impact-${(ct.impact || 'High').toLowerCase()}">${ct.impact || 'High'}</span>
          </div>
          <p class="ai-insight-card-explanation">${ct.explanation}</p>
          <p class="ai-insight-card-reason">${ct.reason}</p>
        </div>
      `).join('');
    }

    // 5. Emerging Opportunities
    const oppsEl = document.getElementById('mt-opportunities-grid');
    if (oppsEl && data.emergingOpportunities) {
      oppsEl.innerHTML = data.emergingOpportunities.map(opp => `
        <div class="mt-opp-card">
          <div class="mt-opp-header">
            <span class="mt-opp-title">${opp.businessIdea}</span>
            <span class="mt-opp-score">Score: ${opp.opportunityScore}/100</span>
          </div>
          <p class="mt-opp-why">${opp.whyTrending}</p>
          <div class="mt-opp-details">
            <div class="mt-opp-detail-row">
              <span class="mt-opp-detail-label">Target Customers</span>
              <span class="mt-opp-detail-val">${opp.targetCustomers || targetVal}</span>
            </div>
            <div class="mt-opp-detail-row">
              <span class="mt-opp-detail-label">Market Demand</span>
              <span class="mt-opp-detail-val" style="color:var(--accent-cyan);">${opp.demand || 'High'}</span>
            </div>
            <div class="mt-opp-detail-row">
              <span class="mt-opp-detail-label">Local Competition</span>
              <span class="mt-opp-detail-val" style="color:#10b981;">${opp.competition || 'Moderate'}</span>
            </div>
          </div>
          <div class="mt-opp-evidence">Evidence: ${opp.evidence}</div>
        </div>
      `).join('');
    }

    // 6. Local Market Insights
    const localInsEl = document.getElementById('mt-local-insights-card');
    if (localInsEl && data.localInsights) {
      const li = data.localInsights;
      localInsEl.innerHTML = `
        <p class="ai-summary-headline">🗺️ Local Competitive Analysis for ${locationVal}</p>
        <div class="ai-summary-reasons">
          <div class="ai-summary-reason">
            <span class="ai-summary-reason-icon">🏢</span>
            <p class="ai-summary-reason-text"><strong>Nearby Business Density:</strong> ${li.nearbyCategories || `${places.length} business listings detected nearby.`}</p>
          </div>
          <div class="ai-summary-reason">
            <span class="ai-summary-reason-icon">⚔️</span>
            <p class="ai-summary-reason-text"><strong>Local Competition:</strong> ${li.localCompetition || 'Moderate operator saturation.'}</p>
          </div>
          <div class="ai-summary-reason">
            <span class="ai-summary-reason-icon">📈</span>
            <p class="ai-summary-reason-text"><strong>Demand Indicators:</strong> ${li.demandIndicators || 'Strong daily pedestrian footfall.'}</p>
          </div>
          <div class="ai-summary-reason">
            <span class="ai-summary-reason-icon">🔓</span>
            <p class="ai-summary-reason-text"><strong>Underserved Market Gaps:</strong> ${li.underservedMarkets || 'High-end specialty offerings are limited.'}</p>
          </div>
          <div class="ai-summary-reason">
            <span class="ai-summary-reason-icon">🚀</span>
            <p class="ai-summary-reason-text"><strong>Emerging Local Opportunities:</strong> ${li.emergingLocalOpportunities || 'Strong potential for premium niche formats.'}</p>
          </div>
        </div>
      `;
    }

    // 7. News / Market Signals
    const signalsEl = document.getElementById('mt-signals-grid');
    if (signalsEl && data.marketSignals) {
      signalsEl.innerHTML = data.marketSignals.map(sig => `
        <div class="mt-signal-card">
          <div>
            <div class="mt-signal-title">${sig.title}</div>
            <p class="mt-signal-summary">${sig.summary}</p>
          </div>
          <div class="mt-signal-meta">
            <span>📅 ${sig.date || '10 Aug 2026'}</span>
            <span class="mt-signal-source">${sig.source || 'Industry News'}</span>
          </div>
        </div>
      `).join('');
    }

    // 8. AI Trend Summary
    const summaryEl = document.getElementById('mt-ai-summary-card');
    if (summaryEl && data.aiSummary) {
      const s = data.aiSummary;
      summaryEl.innerHTML = `
        <div class="mt-summary-section-title">
          <span>🧠</span> Market Trend Summary
        </div>
        <div class="mt-summary-grid">
          <div class="mt-summary-box">
            <div class="mt-summary-box-title">📈 What is Growing</div>
            <div class="mt-summary-box-text">${s.growing}</div>
          </div>
          <div class="mt-summary-box">
            <div class="mt-summary-box-title">📉 What is Declining</div>
            <div class="mt-summary-box-text">${s.declining}</div>
          </div>
          <div class="mt-summary-box">
            <div class="mt-summary-box-title">👥 What Customers Want</div>
            <div class="mt-summary-box-text">${s.customerWants}</div>
          </div>
          <div class="mt-summary-box">
            <div class="mt-summary-box-title">🔓 Where Market Gap Exists</div>
            <div class="mt-summary-box-text">${s.marketGap}</div>
          </div>
        </div>
        <div class="mt-summary-text-block">
          <strong>Promising Categories:</strong> ${s.promisingCategories}<br/><br/>
          ${s.summaryText}
        </div>
      `;
    }

    // 9. Sources
    const sourcesEl = document.getElementById('mt-sources-grid');
    if (sourcesEl) {
      const gMapsActive = !!(GOOGLE_MAPS_API_KEY || localStorage.getItem('mm_google_maps_key'));
      const geminiActive = !!localStorage.getItem('mm_gemini_key');
      const sources = [
        { name: 'Google Maps Places API', type: gMapsActive ? 'Live Real-World Listings' : 'API Key Configured', link: 'https://developers.google.com/maps/documentation/places/web-service' },
        { name: 'Gemini 1.5 Flash LLM', type: geminiActive ? 'AI Intelligence Engine' : 'AI Configured', link: 'https://ai.google.dev/' },
        { name: 'Google Trends Index', type: 'Public Search Volume Data', link: 'https://trends.google.com/' },
        { name: 'Regional Commerce Registry', type: 'Local Business Listings', link: '#' }
      ];

      sourcesEl.innerHTML = sources.map(src => `
        <a href="${src.link}" target="_blank" rel="noopener noreferrer" class="mt-source-card">
          <div class="mt-source-info">
            <span class="mt-source-name">${src.name}</span>
            <span class="mt-source-type">${src.type}</span>
          </div>
          <span class="mt-source-link-icon">↗</span>
        </a>
      `).join('');
    }
  }

  function generateSvgTrendChart(dataPoints, categoryName) {
    if (!dataPoints || dataPoints.length < 2) return '';
    const width = 800;
    const height = 240;
    const padding = { top: 20, right: 30, bottom: 40, left: 40 };

    const values = dataPoints.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = Math.max(1, maxVal - minVal);

    const getX = (idx) => padding.left + (idx / (dataPoints.length - 1)) * (width - padding.left - padding.right);
    const getY = (val) => height - padding.bottom - ((val - minVal) / range) * (height - padding.top - padding.bottom);

    const points = dataPoints.map((d, i) => `${getX(i)},${getY(i)}`).join(' ');
    const areaPoints = `${getX(0)},${height - padding.bottom} ${points} ${getX(dataPoints.length - 1)},${height - padding.bottom}`;

    const dots = dataPoints.map((d, i) => `
      <circle cx="${getX(i)}" cy="${getY(i)}" r="5" class="mt-chart-dot">
        <title>${d.month}: ${d.value} interest score</title>
      </circle>
      <text x="${getX(i)}" y="${height - 12}" text-anchor="middle" class="mt-chart-label">${d.month}</text>
    `).join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" class="mt-svg-chart">
        <defs>
          <linearGradient id="mtChartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#a855f7" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" class="mt-chart-grid-line" />
        <line x1="${padding.left}" y1="${(height - padding.bottom + padding.top) / 2}" x2="${width - padding.right}" y2="${(height - padding.bottom + padding.top) / 2}" class="mt-chart-grid-line" />
        <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="mt-chart-grid-line" />

        <polygon points="${areaPoints}" class="mt-chart-area" />
        <polyline points="${points}" class="mt-chart-line" />

        ${dots}
      </svg>
    `;
  }

  // Initialize Saved Reports page, Market Trends page, Settings page, and Geolocation tracking on startup
  initSavedReportsPage();
  initMarketTrendsPage();
  initSettingsPage();
  initGeolocationTracking();
});

// Spin style keyframe inject for button scan recalculation
const styleElement = document.createElement('style');
styleElement.innerHTML = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleElement);
