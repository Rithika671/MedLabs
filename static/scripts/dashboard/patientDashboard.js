(function() {
  const auth = window.auth;
  const db = window.db;
  const storage = window.storage;

  console.log("Firebase services initialized:", { auth, db, storage });

  function getGreeting() {
    const hour = new Date().getHours();
    return hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  }

  async function getAuthToken() {
    const user = auth.currentUser;
    if (!user) {
      console.error("No current user found");
      return null;
    }
    try {
      const token = await user.getIdToken(true);
      console.log("Retrieved auth token:", token);
      return token;
    } catch (error) {
      console.error("Error getting auth token:", error);
      return null;
    }
  }

  async function fetchWithAuth(url, options = {}) {
    const token = await getAuthToken();
    if (!token) throw new Error("No authentication token available");
    const headers = options.headers ? { ...options.headers } : {};
    headers['Authorization'] = `Bearer ${token}`;
    const method = options.method ? options.method.toUpperCase() : "GET";
    if (method !== "GET" && !(options.body instanceof FormData) && options.body) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(url, { ...options, headers, credentials: 'include' });
  }

  async function loadPatientData(uid) {
    console.log("Loading patient data for UID:", uid);
    const patientRef = db.doc(`patient_registrations/${uid}`);
    try {
      const patientSnap = await patientRef.get();
      if (!patientSnap.exists) {
        console.error("UID unmatched in patient_registrations");
        alert("UID unmatched in patient records!");
        return null;
      }
      const patientData = patientSnap.data();
      console.log("Patient data fetched from Firestore:", patientData);

      const patientIdElement = document.getElementById("patient-id");
      const nextVisitElement = document.getElementById("next-visit");
      const consultantNameElement = document.getElementById("consultant-name");
      const headerTitle = document.querySelector(".dashboard-header h1");

      if (!patientIdElement || !nextVisitElement || !consultantNameElement || !headerTitle) {
        console.error("DOM elements missing:", {
          patientIdElement: !!patientIdElement,
          nextVisitElement: !!nextVisitElement,
          consultantNameElement: !!consultantNameElement,
          headerTitle: !!headerTitle
        });
        return patientData;
      }

      patientIdElement.textContent = uid || "N/A";
      nextVisitElement.textContent = patientData.next_visit ? new Date(patientData.next_visit.seconds * 1000).toLocaleDateString() : "Not scheduled";
      consultantNameElement.textContent = patientData.consultant_id
        ? await db.doc(`consultant_registrations/${patientData.consultant_id}`).get()
            .then(snap => {
              if (snap.exists) {
                const consultantName = snap.data().full_name;
                console.log("Consultant name fetched:", consultantName);
                return consultantName;
              } else {
                console.warn(`No consultant found for ID: ${patientData.consultant_id}`);
                return "No Consultant Assigned";
              }
            })
            .catch(error => {
              console.error("Error fetching consultant name:", error);
              return "No Consultant Assigned";
            })
        : "No Consultant Assigned";

      headerTitle.textContent = `${getGreeting()}, ${patientData.full_name || 'Patient'}!`;

      if (!patientData.consultant_id) {
        const doctorNotification = document.getElementById("doctor-notification");
        if (doctorNotification) doctorNotification.style.display = "block";
      } else {
        const doctorNotification = document.getElementById("doctor-notification");
        if (doctorNotification) doctorNotification.style.display = "none";
      }

      return patientData;
    } catch (error) {
      console.error("Error loading patient data:", error);
      return null;
    }
  }

  async function loadInitialScreening(uid) {
    const container = document.querySelector("#home .screening-container");
    if (!container) {
      console.error("Screening container not found");
      return;
    }
  
    container.innerHTML = `
      <h2 class="section-title">Initial Screening Details</h2>
      <div class="content-placeholder">Loading initial screening details...</div>
    `;
  
    try {
      const screeningDoc = await db.collection("initial_screenings").doc(`initial_screening_${uid}`).get();
      console.log("Fetching initial screening for UID:", uid, "Document exists:", screeningDoc.exists);
  
      if (!screeningDoc.exists) {
        container.innerHTML = `
          <h2 class="section-title">Initial Screening Details</h2>
          <p class="no-data">No initial screening data available.</p>
        `;
        return;
      }
  
      const data = screeningDoc.data();
      console.log("Initial screening data fetched:", data);
  
      const symptomsList = Array.isArray(data.symptoms) ? data.symptoms.join(", ") : data.symptoms || 'N/A';
      const severityList = Array.isArray(data.severity) ? data.severity : [data.severity || 'Unknown'];
      const severityBadges = severityList.map(severity => `
        <span class="severity-badge ${severity.toLowerCase()}">${severity}</span>
      `).join(" ");
      const durationList = Array.isArray(data.duration) ? data.duration.join(", ") : data.duration || 'N/A';
      const triggersList = Array.isArray(data.triggers) ? data.triggers.join(", ") : data.triggers || 'N/A';
  
      let consultantName = "Not Assigned";
      if (data.consultant_id) {
        try {
          const consultantSnap = await db.doc(`consultant_registrations/${data.consultant_id}`).get();
          if (consultantSnap.exists) {
            consultantName = consultantSnap.data().full_name || "Unknown";
            console.log("Consultant name fetched for ID:", data.consultant_id, "Name:", consultantName);
          } else {
            console.warn(`No consultant found for ID: ${data.consultant_id}`);
          }
        } catch (error) {
          console.error("Error fetching consultant name:", error);
        }
      }
  
      const screeningHTML = `
        <h2 class="section-title">Initial Screening Details</h2>
        <div class="screening-cards">
          <div class="screening-card">
            <div class="card-header"><i class="fas fa-heartbeat card-icon"></i> Symptoms</div>
            <div class="card-content">${symptomsList}</div>
          </div>
          <div class="screening-card">
            <div class="card-header"><i class="fas fa-exclamation-triangle card-icon"></i> Severity</div>
            <div class="card-content">${severityBadges}</div>
          </div>
          <div class="screening-card">
            <div class="card-header"><i class="fas fa-clock card-icon"></i> Duration</div>
            <div class="card-content">${durationList}</div>
          </div>
          <div class="screening-card">
            <div class="card-header"><i class="fas fa-bolt card-icon"></i> Triggers</div>
            <div class="card-content">${triggersList}</div>
          </div>
          <div class="screening-card">
            <div class="card-header"><i class="fas fa-user-md card-icon"></i> Consultant</div>
            <div class="card-content">${consultantName}${data.specialty ? ` (${data.specialty})` : ''}</div>
          </div>
          <div class="screening-card full-width">
            <div class="card-header"><i class="fas fa-calendar-alt card-icon"></i> Date</div>
            <div class="card-content">${data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}</div>
          </div>
        </div>
      `;
  
      container.innerHTML = screeningHTML;
  
      container.querySelectorAll('.screening-card').forEach((card, index) => {
        card.style.animation = `fadeIn 0.5s ease-in-out ${index * 0.1}s forwards`;
      });
    } catch (error) {
      console.error("Error loading initial screening:", error);
      container.innerHTML = `
        <h2 class="section-title">Initial Screening Details</h2>
        <p class="error">Failed to load initial screening data: ${error.message}</p>
      `;
    }
  }

  async function loadPrescriptions(uid) {
    const container = document.getElementById("prescriptions");
    if (!container) {
      console.error("Prescriptions section container not found");
      return;
    }

    container.innerHTML = `
      <h2 class="section-title">Prescriptions</h2>
      <div class="content-placeholder">Loading prescriptions...</div>
    `;

    try {
      const querySnapshot = await db.collection('prescriptions')
        .where('uid', '==', uid)
        .orderBy('timestamp', 'desc')
        .get();

      if (querySnapshot.empty) {
        container.innerHTML = `
          <h2 class="section-title">Prescriptions</h2>
          <p class="no-data">No prescriptions found.</p>
        `;
        return;
      }

      let prescriptionsHTML = `
        <h2 class="section-title">Prescriptions</h2>
        <div class="report-container">
      `;
      let index = 0;
      for (const doc of querySnapshot.docs) {
        const data = doc.to_dict ? doc.to_dict() : doc.data();
        const consultantName = data.consultant_id
          ? await db.doc(`consultant_registrations/${data.consultant_id}`).get()
              .then(snap => snap.exists ? snap.data().full_name : "Unknown")
              .catch(() => "Unknown")
          : "Not assigned";

        const metadata = `
          <div class="metadata">
            <div class="metadata-item">
              <span class="label">Patient Name:</span>
              <span class="value">${data.patient_name || 'Unknown'}</span>
            </div>
            <div class="metadata-item">
              <span class="label">Date:</span>
              <span class="value">${new Date(data.timestamp?.seconds * 1000 || Date.now()).toLocaleDateString()}</span>
            </div>
            <div class="metadata-item">
              <span class="label">Consultant:</span>
              <span class="value">${consultantName}</span>
            </div>
          </div>
        `;

        marked.setOptions({
          breaks: true,
          langPrefix: 'language-'
        });

        let regionalSummary = data.summary || 'No summary available';
        console.log(`Before removing markers for UID ${uid}:`, regionalSummary);

        regionalSummary = regionalSummary.replace(/^(?:\s*```markdown\s*[\r\n]*|```[\r\n]*)([\s\S]*?)(?:[\r\n]*```)$/gi, '$1').trim();

        console.log(`After removing markers for UID ${uid}:`, regionalSummary);

        let lines = regionalSummary.split('\n').map(line => line.trim());
        let formattedLines = [];
        let inList = false;
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];
          if (!line) {
            formattedLines.push(line);
            continue;
          }
          if (line.match(/^```(?:markdown)?$/i)) {
            continue;
          }
          if (line.startsWith('Dear') || line.match(/^ಪ್ರೀತಿಯ/) || line.match(/^உங்கள்/) || line.match(/^ನಿಮ್ಮ/) || line.match(/^Here's a summary/)) {
            formattedLines.push(line);
            continue;
          }
          if (!line.startsWith('-') && line.match(/\*\*.*?\*\*/)) {
            line = `- ${line}`;
            inList = true;
          } else if (line.startsWith('-')) {
            inList = true;
          } else if (inList) {
            inList = false;
          }
          formattedLines.push(line);
        }
        regionalSummary = formattedLines.join('\n').trim();

        console.log(`After formatting bullet points for UID ${uid}:`, regionalSummary);

        let regionalSummaryHTML = marked.parse(regionalSummary);
        const englishPatientSummaryHTML = marked.parse(data.english_patient_summary || 'No English patient summary available');

        console.log(`Raw regional summary for UID ${uid}:`, regionalSummary);
        console.log(`Parsed regional summary for UID ${uid}:`, regionalSummaryHTML);
        console.log(`Parsed English patient summary for UID ${uid}:`, englishPatientSummaryHTML);

        if (!regionalSummaryHTML.includes('<ul>') && regionalSummary.includes('-')) {
          console.warn("Markdown parsing failed for regional summary, applying fallback formatting");
          const lines = regionalSummary.split('\n').filter(line => line.trim());
          let formattedHTML = '';
          let inList = false;
          for (const line of lines) {
            if (line.match(/^```(?:markdown)?$/i)) {
              continue;
            }
            if (line.startsWith('Dear') || line.match(/^ಪ್ರೀತಿಯ/) || line.match(/^உங்கள்/) || line.match(/^ನಿಮ್ಮ/) || line.match(/^Here's a summary/)) {
              formattedHTML += `<p>${line}</p>`;
            } else if (line.startsWith('-')) {
              if (!inList) {
                formattedHTML += '<ul>';
                inList = true;
              }
              const formattedLine = line.replace(/^-+\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
              formattedHTML += `<li>${formattedLine}</li>`;
            } else {
              if (inList) {
                formattedHTML += '</ul>';
                inList = false;
              }
              formattedHTML += `<p>${line}</p>`;
            }
          }
          if (inList) {
            formattedHTML += '</ul>';
          }
          regionalSummaryHTML = formattedHTML;
          console.log(`Fallback regional summary HTML for UID ${uid}:`, regionalSummaryHTML);
        }

        prescriptionsHTML += `
          <div class="report-card" data-language="${data.language || 'english'}" style="animation: fadeIn 0.5s ease-in-out ${index * 0.1}s forwards;">
            ${metadata}
            <div class="summary-container regional-summary">${regionalSummaryHTML}</div>
            <div class="summary-container english-patient-summary" style="display: none;">${englishPatientSummaryHTML}</div>
          </div>
        `;
        index++;
      }
      prescriptionsHTML += "</div>";
      container.innerHTML = prescriptionsHTML;
    } catch (error) {
      console.error("Error loading prescriptions:", error);
      container.innerHTML = `
        <h2 class="section-title">Prescriptions</h2>
        <p class="error">Failed to load prescriptions.</p>
      `;
    }
  }

  async function loadLabRecords(uid) {
    const container = document.getElementById("lab-records");
    if (!container) {
      console.error("Lab records section container not found");
      return;
    }

    container.innerHTML = `
      <h2 class="section-title">Lab Reports</h2>
      <div class="content-placeholder">Loading lab records...</div>
    `;

    try {
      const querySnapshot = await db.collection('lab_records')
        .where('uid', '==', uid)
        .orderBy('timestamp', 'desc')
        .get();

      if (querySnapshot.empty) {
        container.innerHTML = `
          <h2 class="section-title">Lab Reports</h2>
          <p class="no-data">No lab records found.</p>
        `;
        return;
      }

      let labRecordsHTML = `
        <h2 class="section-title">Lab Reports</h2>
        <div class="report-container">
      `;
      let index = 0;
      for (const doc of querySnapshot.docs) {
        const data = doc.to_dict ? doc.to_dict() : doc.data();
        const consultantName = data.consultant_id
          ? await db.doc(`consultant_registrations/${data.consultant_id}`).get()
              .then(snap => snap.exists ? snap.data().full_name : "Unknown")
              .catch(() => "Unknown")
          : "Not assigned";

        const metadata = `
          <div class="metadata">
            <div class="metadata-item">
              <span class="label">Patient Name:</span>
              <span class="value">${data.patient_name || 'Unknown'}</span>
            </div>
            <div class="metadata-item">
              <span class="label">Date:</span>
              <span class="value">${new Date(data.timestamp?.seconds * 1000 || Date.now()).toLocaleDateString()}</span>
            </div>
            <div class="metadata-item">
              <span class="label">Consultant:</span>
              <span class="value">${consultantName}</span>
            </div>
          </div>
        `;

        let regionalSummary = data.summary || 'No summary available';
        regionalSummary = regionalSummary.replace(/^(?:\s*```markdown\s*[\r\n]*|```[\r\n]*)([\s\S]*?)(?:[\r\n]*```)$/gi, '$1').trim();

        const regionalSummaryHTML = marked.parse(regionalSummary);
        const englishPatientSummaryHTML = marked.parse(data.english_patient_summary || 'No English patient summary available');

        labRecordsHTML += `
          <div class="report-card" data-language="${data.language || 'english'}" style="animation: fadeIn 0.5s ease-in-out ${index * 0.1}s forwards;">
            ${metadata}
            <div class="summary-container regional-summary">${regionalSummaryHTML}</div>
            <div class="summary-container english-patient-summary" style="display: none;">${englishPatientSummaryHTML}</div>
          </div>
        `;
        index++;
      }
      labRecordsHTML += "</div>";
      container.innerHTML = labRecordsHTML;
    } catch (error) {
      console.error("Error loading lab records:", error);
      container.innerHTML = `
        <h2 class="section-title">Lab Reports</h2>
        <p class="error">Failed to load lab records.</p>
      `;
    }
  }

  async function uploadImage(uid, file, category) {
    console.log("Uploading file:", file.name, "for UID:", uid, "Category:", category);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);
    formData.append("uid", uid);

    try {
      const patientRef = db.doc(`patient_registrations/${uid}`);
      const patientSnap = await patientRef.get();
      if (patientSnap.exists) {
        const patientData = patientSnap.data();
        const consultantId = patientData.consultant_id;
        if (consultantId) {
          formData.append("consultantId", consultantId);
          console.log("Added consultantId:", consultantId, "to upload request");
        } else {
          console.warn("No consultant_id found for UID:", uid);
        }
      } else {
        console.warn("Patient data not found for UID:", uid);
      }
    } catch (error) {
      console.error("Error fetching consultant_id:", error);
    }

    try {
      const response = await fetchWithAuth('/upload-image', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Upload failed with status ${response.status}: ${errorText}`);
        throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Upload failed");

      console.log("File path received:", data.filePath);
      return data.filePath;
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  }

  async function sendDataToBackend(uid, languageText, imagePath, category) {
    try {
      const patientRef = db.doc(`patient_registrations/${uid}`);
      const patientSnap = await patientRef.get();
      const patientData = patientSnap.data();

      const formData = new FormData();
      formData.append("languageText", languageText);
      formData.append("filePath", imagePath);
      formData.append("category", category);
      formData.append("uid", uid);
      if (patientData?.consultant_id) {
        formData.append("consultantId", patientData.consultant_id);
        console.log("Added consultantId:", patientData.consultant_id, "to process-upload request");
      } else {
        console.warn("No consultant_id found for UID:", uid);
      }

      console.log("Sending data to /process-upload:", {
        languageText,
        filePath: imagePath,
        category,
        uid,
        consultantId: patientData?.consultant_id
      });

      const response = await fetchWithAuth("/process-upload", {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      console.log("Response from /process-upload:", data);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${data.error || 'Unknown error'}`);
      }
      if (!data.success) {
        throw new Error(data.error || "Processing failed");
      }
      return data;
    } catch (error) {
      console.error("Error sending data to backend:", error);
      throw error;
    }
  }

  async function initializeDashboard() {
    try {
      console.log("Starting dashboard initialization");
      
      // Early check for Firebase services
      if (!window.auth || !window.db || !window.storage) {
        throw new Error("Firebase services not initialized");
      }

      const user = auth.currentUser;
      if (!user) {
        console.log("No user authenticated, redirecting to login");
        window.location.href = "/login";
        return;
      }

      const uid = user.uid;
      console.log("User authenticated with UID:", uid);

      const patientData = await loadPatientData(uid);
      if (!patientData) {
        console.error("Failed to load patient data, aborting dashboard initialization");
        return;
      }

      const hasDoctor = patientData.consultant_id != null;

      await Promise.all([
        loadInitialScreening(uid),
        loadPrescriptions(uid),
        loadLabRecords(uid)
      ]);

      const logoutBtn = document.getElementById("logout-btn");
      if (!logoutBtn) {
        console.error("Logout button (logout-btn) not found in the DOM after dashboard load");
        return;
      }

      logoutBtn.addEventListener("click", async () => {
        console.log("Logout button clicked, current user:", auth.currentUser);
        if (confirm("Are you sure you want to log out?")) {
          if (!auth.currentUser) {
            console.warn("No active user session found, redirecting to /login");
            window.location.href = "/login";
            return;
          }
          try {
            console.log("Calling server logout");
            const logoutResponse = await fetchWithAuth('/logout?confirm=yes', { method: 'GET', redirect: 'follow' });
            console.log("Server logout response status:", logoutResponse.status);
            if (logoutResponse.status === 302 || logoutResponse.ok) {
              console.log("Server logout successful");
              await auth.signOut();
              console.log("Client-side sign-out successful, redirecting to /login");
              window.location.href = "/login";
            } else {
              throw new Error(`Server logout failed with status ${logoutResponse.status}`);
            }
          } catch (error) {
            console.error("Logout error:", error);
            alert("Failed to log out. Please try again or contact support. Error: " + error.message);
            window.location.href = "/login";
          }
        }
      });

      console.log("Declaring elements object");
      const elements = {
        openUploadBtn: document.getElementById("openUpload"),
        fileInput: document.getElementById("imageUpload"),
        sendBtn: document.getElementById("sendBtn"),
        languageInput: document.getElementById("languageInput"),
        prescriptionBtn: document.getElementById("prescriptionBtn"),
        labRecordBtn: document.getElementById("labRecordBtn"),
        toggleLanguageBtn: document.getElementById("toggle-language"),
        chatInputArea: document.getElementById("chat-input-area")
      };
      console.log("Elements declared:", elements);

      // Check for missing DOM elements
      if (Object.values(elements).some(el => !el)) {
        console.error("Missing required DOM elements:", {
          openUploadBtn: !!elements.openUploadBtn,
          fileInput: !!elements.fileInput,
          sendBtn: !!elements.sendBtn,
          languageInput: !!elements.languageInput,
          prescriptionBtn: !!elements.prescriptionBtn,
          labRecordBtn: !!elements.labRecordBtn,
          toggleLanguageBtn: !!elements.toggleLanguageBtn,
          chatInputArea: !!elements.chatInputArea
        });
        throw new Error("Missing required DOM elements");
      }

      let selectedFile = null;
      let selectedCategory = "prescriptions";
      let preferredLanguage = localStorage.getItem('preferredLanguage') || 'kannada';
      let displayMode = localStorage.getItem('displayMode') || 'regional';

      if (elements.toggleLanguageBtn) {
        elements.toggleLanguageBtn.textContent = displayMode === 'regional' ? 'Switch to English' : 'Switch to Regional Language';
      }

      function toggleSummaries() {
        const cards = document.querySelectorAll('.report-card');
        cards.forEach(card => {
          const regionalSummary = card.querySelector('.regional-summary');
          const englishPatientSummary = card.querySelector('.english-patient-summary');
          
          if (regionalSummary && englishPatientSummary) {
            if (displayMode === 'regional') {
              regionalSummary.style.display = 'block';
              englishPatientSummary.style.display = 'none';
            } else {
              regionalSummary.style.display = 'none';
              englishPatientSummary.style.display = 'block';
            }
          }
        });
      }

      toggleSummaries();

      if (elements.toggleLanguageBtn) {
        elements.toggleLanguageBtn.addEventListener('click', async () => {
          displayMode = displayMode === 'regional' ? 'english' : 'regional';
          localStorage.setItem('displayMode', displayMode);
          elements.toggleLanguageBtn.textContent = displayMode === 'regional' ? 'Switch to English' : 'Switch to Regional Language';
          toggleSummaries();
        });
      }

      // Show chat-input-area only in home section (default)
      if (elements.chatInputArea) {
        console.log("Setting initial chat-input-area visibility to visible");
        elements.chatInputArea.classList.remove('hidden');
      }

      // Attach event listeners for buttons
      elements.openUploadBtn.addEventListener("click", () => {
        console.log("Open upload button clicked");
        elements.fileInput.click();
      });

      elements.fileInput.addEventListener("change", (e) => {
        console.log("File input changed");
        selectedFile = e.target.files[0];
        if (selectedFile && !selectedFile.type.startsWith("image/")) {
          alert("Only image files are allowed.");
          selectedFile = null;
        } else if (selectedFile) {
          if (selectedCategory === "prescriptions") {
            elements.prescriptionBtn.classList.add("active");
            elements.labRecordBtn.classList.remove("active");
            alert("Image will be sent as a Prescription");
          } else if (selectedCategory === "lab_records") {
            elements.labRecordBtn.classList.add("active");
            elements.prescriptionBtn.classList.remove("active");
            alert("Image will be sent as a Lab Record");
          }
        }
      });

      elements.prescriptionBtn.addEventListener("click", () => {
        console.log("Prescription button clicked");
        selectedCategory = "prescriptions";
        elements.prescriptionBtn.classList.add("active");
        elements.labRecordBtn.classList.remove("active");
      });

      elements.labRecordBtn.addEventListener("click", () => {
        console.log("Lab record button clicked");
        selectedCategory = "lab_records";
        elements.labRecordBtn.classList.add("active");
        elements.prescriptionBtn.classList.remove("active");
      });

      elements.sendBtn.addEventListener("click", async () => {
        console.log("Send button clicked");
        const languageText = elements.languageInput.value.trim();
        if (!selectedFile) {
          alert("Please select an image first.");
          return;
        }
        if (!languageText) {
          alert("Please specify a language.");
          return;
        }

        try {
          const imagePath = await uploadImage(uid, selectedFile, selectedCategory);
          await sendDataToBackend(uid, languageText, imagePath, selectedCategory);
          alert("Upload successful!");
          elements.languageInput.value = "";
          elements.fileInput.value = "";
          selectedFile = null;
          elements.prescriptionBtn.classList.remove("active");
          elements.labRecordBtn.classList.remove("active");
          // Reload relevant section
          if (selectedCategory === "prescriptions") {
            await loadPrescriptions(uid);
          } else if (selectedCategory === "lab_records") {
            await loadLabRecords(uid);
          }
        } catch (error) {
          console.error("Error processing upload:", error);
          alert("Error processing upload: " + error.message);
        }
      });

      elements.languageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          console.log("Enter key pressed in language input");
          e.preventDefault();
          elements.sendBtn.click();
        }
      });

      document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', async () => {
          console.log("Menu item clicked:", item.getAttribute('data-section'));
          document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');

          const section = item.getAttribute('data-section');
          document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

          const targetSection = document.getElementById(section);
          if (targetSection) {
            targetSection.classList.add('active');
          }

          // Toggle chat-input-area visibility based on section
          if (elements && elements.chatInputArea) {
            if (section === 'home') {
              console.log("Showing chat-input-area for home section");
              elements.chatInputArea.classList.remove('hidden');
            } else {
              console.log("Hiding chat-input-area for section:", section);
              elements.chatInputArea.classList.add('hidden');
            }
          } else {
            console.error("Elements or chatInputArea not defined when toggling visibility");
          }

          if (section === 'prescriptions') {
            await loadPrescriptions(uid);
          } else if (section === 'lab-records') {
            await loadLabRecords(uid);
          } else if (section === 'home') {
            await loadInitialScreening(uid);
          }
        });
      });
    } catch (error) {
      console.error("Dashboard initialization error:", error);
      alert("Error initializing dashboard: " + error.message);
      window.location.href = "/login";
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded, checking Firebase initialization");
    if (typeof window.auth === 'undefined' || typeof window.db === 'undefined' || typeof window.storage === 'undefined') {
      console.error("Firebase services not initialized. Ensure firebaseConfig.js is loaded correctly.");
      window.location.href = "/login";
      return;
    }

    console.log("Waiting for auth state change...");
    let hasRedirected = false;
    auth.onAuthStateChanged((user) => {
      console.log("Auth state changed:", user ? `User: ${user.email}, UID: ${user.uid}` : "No user");
      if (!user && !hasRedirected) {
        console.log("No user authenticated, redirecting to login");
        hasRedirected = true;
        window.location.href = "/login";
        return;
      }
      if (user && !hasRedirected) {
        console.log("User authenticated, initializing dashboard");
        initializeDashboard();
      }
    });
  });

  window.initializeDashboard = initializeDashboard;
})();