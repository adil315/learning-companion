# 🚀 AI-Powered Gamified Learning Companion
**An Autonomous Agentic Platform for Personalized, Adaptive Education**

Traditional learning platforms often follow a static, "one-size-fits-all" path. This project reimagines digital education by utilizing **Agentic AI** to create a living curriculum that adapts to the learner in real-time. 

Built with the **Google Agent Development Kit (ADK)** and **Gemini 2.0 Flash**, this companion doesn't just display content—it reasons, plans, and gamifies the entire educational journey.

---

### 🧠 The "Agentic" Edge
Unlike standard LLM wrappers, this platform utilizes a sophisticated **autonomous reasoning loop** powered by ADK:

* **Goal Decomposition:** Uses ADK to break broad queries (e.g., *"Teach me Quantum Computing"*) into logical, sequential milestones.
* **Plan-Act-Reflect:** The agent evaluates user quiz performance and dynamically adjusts the roadmap—skipping mastered concepts or injecting remedial content where gaps are identified.
* **Intelligent Tool-Calling:** The agent is empowered to interface with external APIs and internal database functions to validate resources and track real-time XP/progress.

### ✨ Key Features
* 🎯 **Adaptive Roadmaps:** Non-linear learning paths generated on-the-fly based on user interests and current skill levels.
* 🃏 **Smart Flashcards & SRS Agent:**
    * **Automated Generation:** A specialized agent scans learning modules to generate high-quality, conceptual flashcards.
    * **Spaced Repetition (SRS) Logic:** An autonomous agent manages a "Review Queue" using a custom SRS algorithm (similar to Anki/SuperMemo). It tracks recall difficulty and schedules cards for optimal long-term retention.
* 🎮 **Gamified Progression:** Earn XP, badges, and level up through a system backed by **MongoDB** for real-time state persistence.
* 💬 **Conversational Mentorship:** A natural language interface that allows users to ask follow-up questions, request harder challenges, or ask for real-world analogies.
* 🔒 **Secure Infrastructure:** Seamless onboarding and data protection via **Firebase Authentication**.

### 🛠️ Tech Stack
| Component | Technology |
| :--- | :--- |
| **Core AI** | Google Gemini 2.0 Flash via **ADK (Agent Development Kit)** |
| **Frontend** | Next.js (React), Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Database/Auth** | MongoDB, Firebase (SDK) |

---

### 💡 Why I Built This
This project was born to bridge the gap between "consuming content" and "mastering skills." By leveraging **Agentic AI**, the platform acts as a 24/7 private tutor that understands *how* you learn, not just *what* you are learning.

---

### ⚙️ Installation & Setup
1. **Clone the repo:** `git clone https://github.com/your-username/your-repo-name.git`
2. **Install dependencies:** `npm install`
3. **Set up Environment Variables:** Create a `.env` file with your Gemini API Key and Firebase Config.
4. **Run the app:** `npm run dev`
