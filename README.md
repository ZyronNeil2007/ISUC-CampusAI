# CampusAI
## Website Development Plan & Technical Blueprint

**Project Name:** CampusAI  
**Tagline:** Your Campus. Your AI. Always Available.  
**Institution:** Isabela State University – Cabagan Campus  
**Project Type:** AI-Powered Campus Information and Assistance System  
**Primary Platform:** Progressive Web Application (PWA)  
**AI Architecture:** Offline, On-Device Language Model  
**Document Version:** 1.0.0  
**Project Status:** Planning and Prototyping

---

# 1. Project Overview

## 1.1 Introduction

CampusAI is an AI-powered campus information and assistance platform designed specifically for the students, incoming students, transferees, graduating students, and visitors of Isabela State University – Cabagan Campus.

The system provides a centralized platform where users can ask questions and receive helpful information about university-related concerns without manually searching through different websites, documents, announcements, and social media posts.

Unlike conventional chatbot applications that depend on cloud-based AI services, CampusAI is designed around **on-device artificial intelligence**.

The website runs a compatible language model directly inside the user's browser. Its university knowledge base, search index, and conversation history are stored locally on the device.

Once the required AI model and university information have been downloaded, the core assistant can operate without an internet connection.

## 1.2 Vision

To make university information more accessible, understandable, and convenient through an intelligent, private, and offline-capable campus assistant.

## 1.3 Mission

- Simplify access to university information.
- Help students understand academic and administrative procedures.
- Provide accurate, source-supported campus guidance.
- Improve campus navigation and information discovery.
- Promote accessible and privacy-conscious AI technology.
- Demonstrate practical applications of computer science and on-device artificial intelligence.

## 1.4 Core Philosophy

CampusAI follows five principles:

1. **Offline First:** Core AI functionality must work without an internet connection after initial setup.
2. **Privacy First:** Student questions and conversation history should remain on the user's device.
3. **Information Accuracy:** University-specific answers must be grounded in approved university information.
4. **Student-Centered Design:** The interface should be understandable to students with different levels of technical experience.
5. **Transparency:** The system must distinguish verified university information from general educational guidance.

---

# 2. Problem Statement

Students frequently encounter difficulties locating and understanding university-related information.

Information may be distributed across:

- University websites.
- College and department announcements.
- Student handbooks.
- Official social media pages.
- Administrative offices.
- PDF documents.
- Printed announcements.
- Informal student communication channels.

This creates several problems:

1. Students may struggle to identify which office handles a particular concern.
2. Incoming students may be unfamiliar with campus facilities and procedures.
3. Students may have difficulty finding enrollment and academic requirements.
4. Important announcements may be overlooked.
5. Students may receive outdated or conflicting information.
6. Repeated questions may create unnecessary communication workload for university personnel.
7. Internet-dependent AI assistants may be inaccessible when students have limited connectivity.

CampusAI aims to address these challenges through a centralized, intelligent, and offline-capable information platform.

---

# 3. Project Objectives

## 3.1 General Objective

To develop an AI-powered, offline-capable campus assistance website that provides students with accessible, relevant, and source-supported information about Isabela State University – Cabagan Campus.

## 3.2 Specific Objectives

1. Develop a conversational AI interface that can understand natural-language campus-related questions.
2. Integrate an open-weight language model that performs inference directly on the user's device.
3. Implement a local Retrieval-Augmented Generation (RAG) system for university-specific information.
4. Develop a searchable knowledge base containing verified university documents and information.
5. Provide source references for answers generated from university documents.
6. Develop an interactive campus directory and navigation feature.
7. Provide academic, admission, enrollment, scholarship, administrative, and student-life assistance.
8. Implement offline storage for the AI model, knowledge base, application resources, and conversation history.
9. Evaluate the system's answer accuracy, retrieval performance, offline reliability, resource consumption, and usability.

---

# 4. Target Users

CampusAI is intended for the ISU Cabagan community.

| User | Description |
|---|---|
| Incoming Students | Students applying or preparing to enter the university |
| Current Students | Students currently enrolled in any academic program |
| Irregular Students | Students with academic or enrollment concerns involving irregular status |
| Transferees | Students transferring from another institution or program |
| Graduating Students | Students preparing graduation requirements |
| Student Organizations | Students looking for organization-related information |
| Campus Visitors | Individuals looking for university facilities and services |

The system must not assume that every user is an incoming freshman.

Its knowledge categories should support the entire student journey.

---

# 5. System Scope

## 5.1 Included Features

The initial system will include:

- On-device AI chat.
- Local language model management.
- University knowledge base.
- Local document retrieval.
- Retrieval-Augmented Generation.
- Source citations.
- Academic assistance.
- Admission and enrollment guidance.
- Office and campus information.
- Scholarship and financial assistance information.
- Student services information.
- Campus announcements.
- Interactive campus directory.
- Offline application support.
- Local conversation history.
- Knowledge-pack version management.
- Administrative knowledge management for future versions.

## 5.2 Excluded Features in the Initial Prototype

The following are outside the initial scope:

- Official enrollment processing.
- Student registration and payment transactions.
- Access to confidential student records.
- Official academic grading.
- Automated approval of academic requests.
- Direct modification of university records.
- Official issuance of university documents.
- Real-time access to university systems.
- Automated decisions about admission, scholarships, or graduation eligibility.

CampusAI is an information and assistance system, not a replacement for university personnel or official administrative platforms.

---

# 6. Main Website Modules

## 6.1 AI Chat Assistant

The primary feature of CampusAI.

Students can ask questions using natural language instead of navigating through multiple information pages.

### Example Questions

**Academic Assistance**
- What is a prerequisite subject?
- What are the requirements for shifting programs?
- How does the grading system work?
- What should I do if I fail a subject?
- What are the requirements for graduation?

**Admission and Enrollment**
- Where do I take the CAT examination?
- What documents are required for enrollment?
- How do I check my admission status?
- What should I do after passing the CAT?
- Where should I submit my requirements?

**Administrative Assistance**
- Where is the Registrar's Office?
- How do I request a Transcript of Records?
- How can I request a Certificate of Good Moral Character?
- Where can I ask about student clearance?

**Scholarship Assistance**
- What scholarships are available?
- What are the application requirements?
- Where can I inquire about financial assistance?
- What documents should I prepare?

**Campus Navigation**
- Where is the library?
- How do I locate the Computer Science department?
- Where is the guidance office?
- What facilities are available on campus?

### Chat Interface Requirements

- Conversational message layout.
- Message streaming when supported by the local runtime.
- Chat history.
- New conversation button.
- Copy response.
- Regenerate response.
- Clear conversation.
- Source document references.
- Suggested follow-up questions.
- Offline status indicator.
- Model loading indicator.
- Model error handling.
- Stop generation control.

The assistant must clearly indicate when it cannot verify an answer.

---

## 6.2 Academic Assistance

Provides information about academic policies and procedures.

### Categories

- Academic programs.
- Curriculum information.
- Course prerequisites.
- Academic retention policies.
- Shifting procedures.
- Transfer procedures.
- Leave of absence procedures.
- Grading system.
- Graduation requirements.
- Academic calendars.

The assistant must use current, approved university documentation whenever it answers university-specific questions.

It must not invent policies or eligibility requirements.

---

## 6.3 Admission and Enrollment

Provides guidance to incoming and returning students.

### Categories

- Admission requirements.
- CAT examination procedures.
- Application procedures.
- Admission schedules.
- Enrollment requirements.
- Registration instructions.
- Enrollment deadlines.
- Required documents.
- Office assignments.

### Optional Interactive Checklist

Students can maintain a local checklist of their progress.

Example:

- [ ] Review admission requirements.
- [ ] Prepare required documents.
- [ ] Complete the CAT examination.
- [ ] Check admission results.
- [ ] Coordinate with the designated office.
- [ ] Complete enrollment procedures.

Checklist information is personal application data and should remain local unless the user explicitly chooses otherwise.

The checklist must not claim that the student is officially admitted or enrolled.

---

## 6.4 Campus Directory

Provides searchable information about university buildings, offices, departments, and facilities.

### Directory Information

Each entry may contain:

- Office or building name.
- Description.
- Department or responsible unit.
- Building location.
- Operating schedule.
- Contact information.
- Services provided.
- Relevant procedures.
- Official source.
- Last verified date.

### Example

**Registrar's Office**

Description: Handles designated student academic records and registration-related services.

Available information:
- Location.
- Office responsibilities.
- Document request procedures.
- Contact details.
- Related university requirements.

All location and contact details must be verified before publication.

---

## 6.5 Campus Navigation

An interactive campus map that helps students locate university facilities.

### Features

- Campus map.
- Searchable buildings.
- Office markers.
- Building descriptions.
- Facility categories.
- Starting-point selection.
- Destination selection.
- Walking directions where mapped data is available.
- Accessible facility information where verified.

### Suggested Technology

Leaflet.js with locally stored map data.

The map must not depend on an online map tile provider during offline use.

For the initial prototype, use a verified static campus map or locally hosted map assets.

---

## 6.6 Scholarships and Financial Assistance

Provides information about available financial assistance programs.

### Information Categories

- Scholarship programs.
- Financial assistance.
- Eligibility criteria.
- Application requirements.
- Submission procedures.
- Application deadlines.
- Responsible offices.

Scholarship availability and deadlines must be versioned and verified.

The AI must not guarantee scholarship approval or eligibility.

---

## 6.7 Student Life

Provides campus-related student information.

### Categories

- Student organizations.
- Student government.
- Campus activities.
- University events.
- Student services.
- Student development programs.
- Campus facilities.

Information should be separated by responsible organization or office.

---

## 6.8 Announcements and Events

Displays important campus information.

### Announcement Fields

- Announcement title.
- Description.
- Category.
- Publication date.
- Effective date.
- Expiration date.
- Responsible office.
- Official source.
- Verification status.

Announcements must display their publication and validity dates.

Expired announcements should be clearly marked and excluded from answers about current schedules unless the user asks about historical information.

---

## 6.9 Document and Procedure Guide

Helps students understand how to request university documents.

Possible categories:

- Transcript of Records.
- Certificate of Enrollment.
- Certificate of Good Moral Character.
- Student clearance.
- Other officially supported document requests.

Each guide should include:

1. Purpose of the document.
2. Requirements.
3. Request procedure.
4. Responsible office.
5. Fees, if officially documented.
6. Expected processing period, if officially documented.
7. Official reference.

CampusAI only explains procedures. It does not generate official university certificates.

---

# 7. Artificial Intelligence Architecture

## 7.1 AI Architecture Overview

CampusAI will use an on-device AI architecture.

The website must not depend on an external AI inference API.

The language model runs locally inside the browser through a compatible runtime.

### Proposed Architecture

Student
  |
  v
CampusAI Web Interface
  |
  v
CampusAI Core
  |
  +------------------------+
  |                        |
  v                        v
Local AI Runtime       Local Knowledge Retriever
(WebLLM)               (RAG)
  |                        |
  v                        v
Local Language Model   Local Document Index
  |                        |
  +------------+-----------+
               |
               v
        Context Preparation
               |
               v
       AI Response Generation
               |
               v
       Source Verification
               |
               v
         Student Response

The complete inference and retrieval pipeline operates locally.

## 7.2 Local AI Runtime

### Primary Candidate: WebLLM

WebLLM is the initial recommended browser inference runtime.

Responsibilities:

- Load compatible language models.
- Initialize the local inference engine.
- Perform model inference.
- Manage generation parameters.
- Stream generated tokens when supported.
- Handle model loading and runtime errors.
- Use available browser GPU acceleration.

### Model Selection

Potential model families to evaluate:

- Qwen.
- Llama.
- Gemma.
- Phi.

Model selection must consider:

- License compatibility.
- Model size.
- Quantization.
- Context window.
- Multilingual capability.
- Reasoning quality.
- Browser compatibility.
- Memory consumption.
- Response latency.

Do not select a model solely because it has a large parameter count.

The smallest model that meets the project's accuracy and usability requirements should be preferred.

### Model Benchmarking

Evaluate multiple compatible models using the same test questions.

Record:

| Metric | Description |
|---|---|
| Model Size | Download size |
| Initialization Time | Time required to load the model |
| Response Latency | Time to first response and total generation time |
| Memory Usage | Approximate memory consumption |
| Answer Accuracy | Correctness against verified answers |
| Citation Compliance | Ability to use supplied source context |
| Offline Capability | Ability to operate without internet |

The selected model must be documented in the technical specification.

## 7.3 Retrieval-Augmented Generation (RAG)

RAG allows the language model to answer questions using approved university information.

The model should not rely exclusively on pretrained knowledge for university-specific policies.

### RAG Workflow

1. Student submits a question.
2. The application identifies the question and searches the local knowledge index.
3. The retriever selects relevant document sections.
4. The application checks document validity and metadata.
5. Relevant sections are added to the model's context.
6. The local model generates a response.
7. The application presents the answer and source references.

### Initial Retrieval Strategy

Start with keyword search or BM25.

Add local embedding-based semantic search when the initial retrieval system has been evaluated.

### Knowledge Retrieval Requirements

- Search locally stored documents.
- Support document categories.
- Support metadata filtering.
- Prioritize current, approved information.
- Exclude expired content from current-policy responses.
- Return source identifiers and relevant document sections.
- Provide an explicit no-reliable-source result when appropriate.

### Grounding Rules

The AI must:

- Use retrieved documents for university-specific answers.
- Avoid inventing requirements or deadlines.
- Distinguish official policy from general educational explanations.
- Explain when information is unavailable.
- Refer students to the responsible office when a question requires official confirmation.
- Display citations that point to the actual supporting document.

A citation must not be generated merely because a document was retrieved. The cited section must support the claim being made.

---

# 8. Knowledge Base Architecture

## 8.1 Purpose

The knowledge base contains the approved information used by CampusAI.

It is stored locally and searched without requiring a remote database.

## 8.2 Supported Document Types

Initial support:

- PDF.
- TXT.
- Markdown.
- HTML.
- CSV.

DOCX support may be added after the basic pipeline works.

Scanned documents require OCR preprocessing during knowledge-pack preparation.

## 8.3 Knowledge Categories

Suggested structure:

knowledge/
  academic/
  admission/
  enrollment/
  scholarships/
  campus_offices/
  campus_facilities/
  student_services/
  student_life/
  announcements/
  document_requests/
  university_policies/

## 8.4 Document Metadata

Each document should contain:

- Document ID.
- Document title.
- Category.
- Responsible office.
- Publication date.
- Effective date.
- Expiration date.
- Version.
- Verification status.
- Official source.
- Last verified date.

## 8.5 Document Verification

Only authorized and verified university information should be included in the official knowledge pack.

Suggested statuses:

- Draft.
- Pending Verification.
- Verified.
- Superseded.
- Expired.
- Archived.

The assistant must not treat draft or unverified content as official policy.

## 8.6 Knowledge Pack

A knowledge pack is a versioned collection of approved university information.

Example:

campusai-knowledge/
  manifest.json
  documents/
  metadata/
  indexes/
  maps/
  assets/

The manifest should contain:

- Knowledge pack version.
- Campus identifier.
- Creation date.
- Publication date.
- Document count.
- Supported application version.
- File hashes.
- Verification information.

The knowledge pack should be downloadable as a single update package or as verified incremental updates.

The application should validate package integrity before installation.

---

# 9. Offline-First Architecture

## 9.1 Offline Requirements

The application must support:

- Opening the installed website without internet.
- Loading previously downloaded AI models.
- Accessing locally stored university documents.
- Searching the local knowledge base.
- Generating AI responses locally.
- Viewing saved conversations.
- Accessing locally stored campus map information.
- Maintaining local preferences.

## 9.2 First-Time Setup

Internet access is required for initial installation and downloads unless the model and knowledge package are provided through another supported distribution method.

### Setup Workflow

1. User opens CampusAI.
2. Application checks browser compatibility.
3. Application checks available storage.
4. User selects an available AI model.
5. Application displays the estimated download size.
6. User downloads the model.
7. User downloads the university knowledge pack.
8. Application validates downloaded files.
9. Application initializes the model.
10. Application runs a local test question.
11. Offline mode becomes available.

## 9.3 Offline Storage

| Information | Storage |
|---|---|
| Application assets | Service Worker Cache Storage |
| AI model | Origin Private File System or supported persistent storage |
| Chat history | IndexedDB |
| Local settings | IndexedDB |
| Knowledge documents | IndexedDB or OPFS |
| Search index | IndexedDB or OPFS |
| Campus map data | Local application storage |

Storage decisions must be tested across supported browsers.

Browser storage is not guaranteed to be permanent. The system should detect storage availability, request persistent storage where supported, and provide a recovery mechanism if files are removed.

## 9.4 Network Restrictions

During offline operation:

- No external AI inference requests.
- No external document retrieval.
- No external analytics requests.
- No mandatory cloud authentication.
- No remote chat-history synchronization.

Optional network access may be used for model downloads and approved information updates.

The application must clearly distinguish offline operation from connected update mode.

---

# 10. Website Pages and Navigation

## 10.1 Main Navigation

Recommended navigation:

- Home.
- AI Assistant.
- Campus Directory.
- Campus Map.
- Student Guide.
- Announcements.
- About CampusAI.
- Settings.

The AI Assistant should be the central and most prominent feature.

## 10.2 Homepage

### Hero Section

**Headline:**

Your Campus. Your AI. Always Available.

**Description:**

Discover university information, get academic guidance, locate campus facilities, and find answers to your campus-related questions with CampusAI.

**Primary Actions:**

- Start Chatting.
- Explore Campus.

### Homepage Sections

1. Hero and AI search interface.
2. Popular campus questions.
3. Campus information categories.
4. Campus directory preview.
5. Latest downloaded announcements.
6. Offline AI introduction.
7. Privacy and technology explanation.
8. Footer.

## 10.3 AI Assistant Page

The assistant page should prioritize readability and usability.

### Layout

- Sidebar for conversation history.
- Main conversation area.
- Message composer.
- Suggested questions.
- Source references.
- AI status information.
- Model status indicator.

### Responsive Behavior

Desktop:
- Sidebar and conversation area.
- Expanded conversation width.
- Optional source panel.

Mobile:
- Compact navigation.
- Full-width conversation.
- Bottom-aligned message composer.
- Collapsible conversation history.

## 10.4 Settings Page

Settings should contain:

- AI model information.
- Model download status.
- Model storage size.
- Model loading status.
- Knowledge pack version.
- Last knowledge update.
- Offline readiness.
- Clear conversation history.
- Clear local application data.
- Theme selection.
- Privacy information.

---

# 11. UI/UX Design System

## 11.1 Design Direction

CampusAI should have a modern, clean, university-oriented interface.

Design inspiration:

- Modern productivity applications.
- AI chat interfaces.
- University information portals.
- Minimalist software dashboards.

Avoid an overly complicated administrative dashboard appearance.

The experience should feel approachable to incoming students and efficient for regular students.

## 11.2 Design Principles

- Clean layouts.
- Consistent spacing.
- Strong visual hierarchy.
- Readable typography.
- Accessible color contrast.
- Responsive components.
- Clear interaction states.
- Minimal unnecessary decoration.
- Consistent icons.
- Useful empty states.

## 11.3 Theme Support

The application should support:

- Light mode.
- Dark mode.
- System theme.

## 11.4 Suggested Visual Language

Use a restrained university-inspired palette.

Suggested colors:

- Primary: Deep green.
- Secondary: Neutral gray.
- Accent: Warm yellow.
- Background: White or dark neutral.
- Success: Green.
- Warning: Amber.
- Error: Red.

These are proposed design tokens, not official university brand colors. Official branding should only be used with permission.

## 11.5 Typography

Recommended:

- Inter.
- System UI fallback.

Use consistent font sizes and weights for headings, body text, metadata, and assistant responses.

---

# 12. Technical Stack

## 12.1 Frontend

Recommended:

- HTML5.
- CSS3.
- JavaScript.
- Vite.
- Progressive Web App support.

React may be introduced if the project benefits from a component-driven architecture, but it is not mandatory.

## 12.2 AI

- WebLLM.
- Compatible open-weight language model.
- WebGPU where supported.
- Local model caching.

## 12.3 Knowledge Retrieval

Initial:

- Local document parser.
- Text chunking.
- BM25 or keyword-based search.

Future:

- Local embeddings.
- Semantic retrieval.
- Hybrid search.
- Reranking.

## 12.4 Storage

- IndexedDB.
- Origin Private File System where supported.
- Cache Storage.
- Local persistent application data.

## 12.5 Mapping

- Leaflet.js.
- Locally stored map assets.
- Verified building coordinates.
- Locally available navigation data.

## 12.6 Testing

- Browser compatibility testing.
- Offline testing.
- AI answer evaluation.
- Retrieval evaluation.
- Responsive design testing.
- Accessibility testing.
- Performance benchmarking.

---

# 13. Proposed Website Folder Structure

The following is a suggested modular structure for the website.

campusai/
│
├── public/
│   ├── icons/
│   ├── images/
│   ├── fonts/
│   ├── maps/
│   └── manifest.webmanifest
│
├── knowledge/
│   ├── academic/
│   ├── admission/
│   ├── enrollment/
│   ├── scholarships/
│   ├── offices/
│   ├── facilities/
│   ├── student-services/
│   ├── student-life/
│   ├── announcements/
│   └── document-requests/
│
├── src/
│   ├── app/
│   │   ├── App.js
│   │   ├── router.js
│   │   └── initialization.js
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── navigation/
│   │   ├── chat/
│   │   ├── cards/
│   │   ├── forms/
│   │   ├── feedback/
│   │   └── common/
│   │
│   ├── pages/
│   │   ├── home/
│   │   ├── assistant/
│   │   ├── directory/
│   │   ├── campus-map/
│   │   ├── student-guide/
│   │   ├── announcements/
│   │   ├── about/
│   │   └── settings/
│   │
│   ├── ai/
│   │   ├── engine/
│   │   │   ├── AIEngine.js
│   │   │   ├── WebLLMEngine.js
│   │   │   └── ModelManager.js
│   │   │
│   │   ├── conversation/
│   │   │   ├── ConversationManager.js
│   │   │   ├── PromptManager.js
│   │   │   └── ContextManager.js
│   │   │
│   │   ├── retrieval/
│   │   │   ├── Retriever.js
│   │   │   ├── DocumentSearch.js
│   │   │   ├── BM25.js
│   │   │   └── ChunkManager.js
│   │   │
│   │   ├── generation/
│   │   │   ├── ResponseGenerator.js
│   │   │   └── CitationManager.js
│   │   │
│   │   └── evaluation/
│   │       └── AnswerEvaluator.js
│   │
│   ├── data/
│   │   ├── database/
│   │   │   ├── Database.js
│   │   │   ├── ChatRepository.js
│   │   │   └── KnowledgeRepository.js
│   │   │
│   │   ├── campus/
│   │   └── configuration/
│   │
│   ├── services/
│   │   ├── ModelService.js
│   │   ├── KnowledgePackService.js
│   │   ├── StorageService.js
│   │   ├── OfflineService.js
│   │   └── CompatibilityService.js
│   │
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── global.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   ├── responsive.css
│   │   └── themes.css
│   │
│   ├── utils/
│   │   ├── date.js
│   │   ├── format.js
│   │   └── validation.js
│   │
│   └── main.js
│
├── tests/
│   ├── ai/
│   ├── retrieval/
│   ├── offline/
│   ├── storage/
│   └── ui/
│
├── docs/
│   ├── architecture.md
│   ├── ai-models.md
│   ├── knowledge-base.md
│   ├── privacy.md
│   ├── testing.md
│   └── deployment.md
│
├── index.html
├── package.json
├── vite.config.js
├── README.md
└── .gitignore

This is a target structure. It should be introduced gradually rather than creating every file before the corresponding functionality exists.

---

# 14. Core Data Models

The initial website can use IndexedDB for local persistence.

## 14.1 Conversation

| Field | Type | Description |
|---|---|---|
| id | String | Unique conversation ID |
| title | String | Conversation title |
| createdAt | Date | Creation date |
| updatedAt | Date | Last update |

## 14.2 Message

| Field | Type | Description |
|---|---|---|
| id | String | Unique message ID |
| conversationId | String | Parent conversation |
| role | String | User or assistant |
| content | String | Message content |
| timestamp | Date | Message time |
| citations | Array | Supporting source references |

## 14.3 Knowledge Document

| Field | Type | Description |
|---|---|---|
| id | String | Document identifier |
| title | String | Document title |
| category | String | Knowledge category |
| office | String | Responsible office |
| version | String | Document version |
| publishedAt | Date | Publication date |
| expiresAt | Date or null | Expiration date |
| verificationStatus | String | Approval status |
| source | String | Original source reference |

## 14.4 Knowledge Chunk

| Field | Type | Description |
|---|---|---|
| id | String | Chunk identifier |
| documentId | String | Parent document |
| text | String | Extracted content |
| section | String | Document section |
| metadata | Object | Search metadata |

## 14.5 Campus Location

| Field | Type | Description |
|---|---|---|
| id | String | Location identifier |
| name | String | Building or office name |
| category | String | Facility category |
| description | String | Location description |
| latitude | Number | Latitude, if verified |
| longitude | Number | Longitude, if verified |
| mapReference | String | Local map reference |

All actual university information must be verified before being added.

---

# 15. AI Behavior and Prompt Requirements

The AI assistant must follow a consistent set of rules.

## 15.1 Assistant Identity

The AI identifies itself as CampusAI, a virtual information assistant for Isabela State University – Cabagan Campus.

## 15.2 Response Rules

- Use clear and understandable language.
- Prefer concise explanations.
- Explain technical or academic terms when necessary.
- Use retrieved university information for university-specific questions.
- Provide source references.
- Avoid inventing schedules, fees, requirements, and policies.
- Clearly identify uncertain or unavailable information.
- Recommend the responsible office for matters requiring official confirmation.
- Distinguish general knowledge from official university policy.

## 15.3 Handling Unsupported Questions

If the knowledge base does not contain reliable information:

1. Explain that the information could not be verified.
2. Avoid inventing an answer.
3. Suggest the appropriate university office if known and verified.
4. Provide the relevant official contact or document reference if available.

## 15.4 General Educational Questions

CampusAI may answer general educational questions even when they are not found in the university knowledge base.

Examples:

- What is object-oriented programming?
- What is a prerequisite?
- What is a thesis?
- What is data mining?

The system must label these as general educational explanations rather than official university policies.

---

# 16. Security and Privacy

Privacy is one of the central design requirements.

## 16.1 Local Processing

The application should process the following locally:

- Student questions.
- Conversation history.
- Knowledge retrieval.
- AI inference.
- Personal preferences.
- Local checklists.

## 16.2 Data Minimization

The website should not require students to provide:

- Student ID numbers.
- Passwords.
- Personal academic records.
- Financial information.
- Sensitive personal documents.

These are unnecessary for the basic information assistant.

## 16.3 Storage Controls

Students should be able to:

- View saved conversations.
- Delete individual conversations.
- Clear all chat history.
- Clear downloaded knowledge packs.
- Remove the local AI model.
- Clear application data.

## 16.4 Security Requirements

- Validate downloaded knowledge packages.
- Verify package integrity using cryptographic hashes.
- Sanitize displayed document content.
- Prevent unsafe HTML rendering.
- Avoid storing secrets in frontend source code.
- Use a strict Content Security Policy where compatible with the AI runtime.
- Avoid unnecessary third-party scripts.
- Protect administrative publishing workflows in future versions.

## 16.5 Privacy Limitations

Local processing reduces the need to transmit student questions to external AI services, but it does not automatically make the entire website risk-free.

Browser extensions, shared devices, device compromise, downloaded files, and browser storage behavior can still affect privacy.

The privacy policy must accurately explain these limitations.

---

# 17. Administrative Knowledge Management

A future administrative interface may allow authorized university personnel to manage the information distributed through CampusAI.

## 17.1 Proposed Admin Features

- Add university documents.
- Edit document metadata.
- Categorize information.
- Verify information.
- Mark documents as expired.
- Publish knowledge-pack versions.
- Review document integrity.
- Manage campus locations.
- Prepare announcements.
- Generate knowledge-pack manifests.

## 17.2 Publishing Workflow

1. Administrator uploads a document.
2. System extracts its content.
3. Administrator checks extracted information.
4. Responsible personnel verify the content.
5. System processes the verified document.
6. System generates the knowledge index.
7. Administrator publishes a new knowledge-pack version.
8. Students download the update.

The administrative publishing process may require a connected environment.

However, the student-facing AI inference and retrieval system must remain fully on-device.

The admin publishing component should be separated from the offline student application.

---

# 18. Performance and Compatibility

## 18.1 Supported Environment

Initial target:

- Modern desktop browsers.
- WebGPU-compatible browsers for local AI inference.
- Android browsers that support the required WebGPU capabilities.
- Sufficient available device memory and storage.

The project must maintain a documented compatibility matrix.

## 18.2 Compatibility Detection

Before model installation, the application should check:

- WebGPU availability.
- Required browser capabilities.
- Available storage.
- Model compatibility.
- Runtime initialization.
- Device resource limitations.

Do not assume that all browsers or devices can run the same model.

## 18.3 Fallback Behavior

When local AI inference is unavailable:

- Explain why the device is unsupported.
- Offer compatible model options if available.
- Preserve access to non-AI campus information pages.
- Allow local keyword search when possible.
- Never silently switch to a cloud AI service.

## 18.4 Performance Goals

The following are proposed evaluation targets, not guaranteed hardware performance:

- Application interface loads without an internet connection after installation.
- Previously downloaded models initialize successfully on supported devices.
- Local document retrieval returns relevant results.
- Conversation history remains available offline.
- No external AI inference request occurs.
- Model and knowledge-pack downloads show progress.
- The application handles insufficient storage gracefully.

Actual response speed and memory use must be measured on representative devices.

---

# 19. Development Roadmap

Development should proceed incrementally.

## Phase 1 — Planning and Research

Tasks:

- Finalize project requirements.
- Identify target browsers and devices.
- Collect available university information.
- Identify approved information sources.
- Evaluate model licensing.
- Research WebLLM capabilities.
- Benchmark compatible models.
- Prepare initial design system.

Deliverables:

- Project requirements.
- Initial UI wireframes.
- Technical feasibility report.
- Initial model evaluation.

## Phase 2 — Website Foundation

Tasks:

- Set up Vite.
- Establish project folder structure.
- Create responsive layout.
- Implement homepage.
- Implement AI assistant interface.
- Create settings page.
- Add light and dark themes.
- Implement PWA configuration.

Deliverables:

- Working website interface.
- Responsive pages.
- Installable PWA foundation.

## Phase 3 — Local AI Integration

Tasks:

- Integrate WebLLM.
- Implement model manager.
- Implement model selection.
- Add download progress.
- Add model initialization.
- Implement local inference.
- Add generation controls.
- Test without internet.

Deliverables:

- Working local AI chat.
- Model management interface.
- Offline inference demonstration.

## Phase 4 — Knowledge Base and RAG

Tasks:

- Collect approved documents.
- Extract document text.
- Implement text chunking.
- Store document metadata.
- Implement local keyword search.
- Add BM25 retrieval.
- Integrate retrieved context into prompts.
- Implement source citations.
- Evaluate retrieval quality.

Deliverables:

- Searchable local knowledge base.
- Campus-aware AI assistant.
- Source-supported answers.

## Phase 5 — Campus Modules

Tasks:

- Develop academic assistance.
- Develop admission and enrollment guidance.
- Develop office directory.
- Develop campus map.
- Develop scholarship information.
- Develop student-life information.
- Develop announcements.
- Develop document request guides.

Deliverables:

- Complete initial campus information modules.

## Phase 6 — Offline Storage and Synchronization

Tasks:

- Implement IndexedDB.
- Implement local model storage.
- Implement knowledge-pack installation.
- Implement version checking.
- Implement package validation.
- Implement persistent storage requests.
- Implement recovery and re-download workflows.

Deliverables:

- Reliable offline experience.
- Versioned local knowledge base.

## Phase 7 — Testing and Evaluation

Tasks:

- Test model compatibility.
- Test offline functionality.
- Evaluate AI accuracy.
- Evaluate document retrieval.
- Test source citations.
- Measure response latency.
- Measure storage and memory usage.
- Conduct student usability testing.
- Fix identified problems.

Deliverables:

- Test reports.
- Evaluation results.
- Improved prototype.

## Phase 8 — Finalization

Tasks:

- Finalize documentation.
- Prepare deployment.
- Prepare demonstration scenarios.
- Prepare research presentation.
- Document limitations.
- Prepare future development recommendations.

Deliverables:

- CampusAI web prototype.
- Technical documentation.
- Research evaluation.
- Project demonstration.

---

# 20. Testing and Evaluation Framework

## 20.1 Functional Testing

Verify that:

- Students can start conversations.
- The model can generate responses.
- Model downloads work.
- Knowledge documents can be installed.
- Local search works.
- Citations open the correct documents.
- Conversations can be saved and deleted.
- Campus directory searches work.
- The application works offline.

## 20.2 AI Answer Evaluation

Prepare a test dataset of verified university questions.

Each question should have:

- Question ID.
- Question category.
- User question.
- Expected answer.
- Supporting document.
- Expected source section.
- Evaluation criteria.

Evaluate:

1. Factual correctness.
2. Relevance.
3. Retrieval accuracy.
4. Citation correctness.
5. Hallucination rate.
6. Appropriate refusal when evidence is missing.

## 20.3 Offline Testing

Test under the following conditions:

- First-time installation.
- Initial model download.
- Successful model initialization.
- Browser restart.
- Internet disconnection.
- Device restart.
- Storage pressure.
- Knowledge-pack update.
- Interrupted download.
- Model removal and recovery.

## 20.4 Usability Testing

Potential participants:

- Incoming students.
- Current students.
- Irregular students.
- Transferees.

Suggested evaluation areas:

- Ease of use.
- Navigation clarity.
- Response understandability.
- Perceived usefulness.
- Trust in source references.
- Overall satisfaction.

Participation should be voluntary and handled with appropriate research consent and privacy safeguards.

---

# 21. Risks and Limitations

| Risk | Mitigation |
|---|---|
| Device cannot run selected model | Compatibility checks and smaller models |
| AI provides incorrect answers | RAG, source validation, and uncertainty handling |
| University documents become outdated | Versioned knowledge packs |
| Model download is too large | Display size and support Wi-Fi downloads |
| Browser removes stored files | Persistent storage and recovery mechanisms |
| Poor document retrieval | Improve chunking, indexing, and evaluation |
| Model gives misleading policy advice | Strong grounding rules and official-source citations |
| Unsupported campus locations | Require verified map information |
| Incomplete university information | Clearly disclose coverage limitations |

---

# 22. Minimum Viable Product (MVP)

The first working version should be intentionally limited.

## CampusAI v0.1

Required features:

- Responsive web interface.
- PWA installation support.
- WebGPU compatibility detection.
- Local AI model download.
- Local model inference through WebLLM.
- Local chat interface.
- Basic conversation history.
- Local university FAQ knowledge base.
- Keyword-based retrieval.
- Basic RAG integration.
- Source references.
- Offline operation after setup.
- Model status and storage management.

Not required for v0.1:

- Complete campus map.
- Advanced semantic retrieval.
- User accounts.
- Online synchronization.
- Administrative dashboard.
- Android application.
- All university document categories.

The MVP must prove that the central technology works before the project expands.

---

# 23. Future Enhancements

Possible future versions:

### v0.2 — Improved Intelligence
- Hybrid search.
- Local embedding models.
- Semantic retrieval.
- Improved conversation context.
- Better citation validation.

### v0.3 — Campus Information Expansion
- Full campus directory.
- Interactive campus navigation.
- Academic assistance.
- Admission and enrollment guidance.
- Scholarships and student services.

### v0.4 — Knowledge Management
- Administrative dashboard.
- Document verification workflow.
- Knowledge-pack publishing.
- Version management.
- Update notifications.

### v0.5 — Android Integration
- Native Android interface.
- On-device Android AI runtime.
- Shared knowledge-pack format.
- Shared AI evaluation dataset.
- Android-specific model optimization.

### v1.0 — Full CampusAI Release
- Complete campus information coverage.
- Stable offline AI.
- Web and Android support.
- Evaluated AI performance.
- Documented privacy and security behavior.

These versions are proposed milestones, not fixed release dates.

---

# 24. Definition of Success

CampusAI will be considered a successful prototype when:

1. The website can run its AI model locally on supported browsers.
2. It does not require an external AI inference API.
3. It can answer questions using verified local university information.
4. It can display accurate supporting document references.
5. It continues operating without internet after setup.
6. It can manage downloaded models and knowledge packs.
7. It handles unsupported questions responsibly.
8. It demonstrates measurable usefulness to students.
9. It has documented hardware and browser limitations.
10. Its performance and usability have been evaluated.

---

# 25. Final Project Identity

**CampusAI**

*Your Campus. Your AI. Always Available.*

An offline-first, on-device artificial intelligence platform designed to make university information more accessible to the ISU Cabagan community.

CampusAI combines:

- Artificial Intelligence.
- Natural Language Processing.
- Information Retrieval.
- Retrieval-Augmented Generation.
- Local Data Storage.
- Progressive Web Applications.
- Human-Computer Interaction.
- Campus Information Systems.

Its defining characteristic is that the AI assistant does not depend on an external AI inference service.

The student downloads the model and university knowledge pack, and the device becomes capable of answering supported campus-related questions locally.

**The ultimate goal is simple: make university information accessible whenever students need it, even when an internet connection is unavailable.**

---

# END OF DEVELOPMENT PLAN
