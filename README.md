# Cipher

> **A modern, modular, and customizable web-based chat platform that empowers users to host their own servers and control their communication environment fully.**

---

## Table of Contents

- [About Cipher](#about-cipher)  
- [Current Progress](#current-progress)  
- [Future Development Roadmap](#future-development-roadmap)  
- [Features](#features)  
- [Getting Started](#getting-started)  
  - [Prerequisites](#prerequisites)  
  - [Installation](#installation)  
  - [Running the Server](#running-the-server)  
  - [Accessing the Client](#accessing-the-client)  
- [Project Architecture](#project-architecture)  
- [Contributing](#contributing)  
- [License](#license)  

---

## About Cipher

Cipher is a next-generation open-source chat platform designed from the ground up to provide full user control, customization, and extensibility. Unlike traditional chat services, Cipher allows anyone to host their own chat server, customize the client UI, and manage user accounts and friend lists with complete flexibility.

The platform focuses on:

- **Modularity:** Both server and client are designed to be extensible and customizable.  
- **Privacy & Control:** Users control their data and how it flows.  
- **Cross-Platform:** Primarily web-based with plans for multiple client interfaces.  
- **Innovative Features:** P2P direct messaging, advanced theming, and lightweight group chat hosting.

---

## Current Progress

Cipher is actively under development. Below is a summary of what is currently implemented and stable:

### Backend Server

- **User Authentication:** Session-based login system with whitelist-style signup approval.  
- **Persistent Storage:** User data and friends list stored in SQLite.  
- **WebSocket Communication:** Real-time messaging support with session authentication.  
- **Rooms & Members API:** Endpoints for managing chat rooms and member lists.  
- **Rate Limiting & Security:** Basic protections against abuse (login/signup throttling).  

### Client Web Interface

- **Modular UI:** React-style inspired, currently vanilla HTML/CSS/JS with plans for React port.  
- **Chat Interface:** Glassmorphism UI with frosted glass effects, dark themes, and accent colors.  
- **Friend & Room Lists:** Sidebar displays for members and rooms (default rooms created automatically).  
- **Direct Messaging:** P2P-enabled DMs with fallback mechanisms.  
- **User Profiles:** Local profile storage, customizable nicknames, and avatars (Names only at the moment).

### Server Web Interface

- Public-facing pages for login and server settings with a cozy, informal design matching the client theme.

---

## Future Development Roadmap

Cipher is designed with extensibility and innovation in mind. Planned future work includes:

- **Full React Client:** Transition the client UI to React for better state management and modularity.  
- **Public API:** Expose a comprehensive API for third-party client and tool development.  
- **Micro-host P2P Server:** Lightweight private group chat hosted by individual users.  
- **Enhanced Security:** Implement OAuth options, 2FA, and robust spam/bot protection.  
- **Custom Theming & Plugins:** User-friendly theme and plugin system for personalized experiences.  
- **Offline Messaging & Sync:** Support for message caching, offline reading, and multi-device sync.  
- **Mobile Support:** Responsive design and dedicated mobile clients.  
- **Notification System:** Desktop and in-browser notifications for mentions, messages, and events.

---

## Features

- Modular, open-source architecture  
- Server-hosted chat rooms and private messaging  
- Friend requests with manual approval  
- Customizable profiles and themes  
- Real-time WebSocket chat communication  
- Whitelist-based user registration for controlled access  
- Lightweight P2P direct messaging  
- Glassmorphism UI with modern styling  

---

## Getting Started

### Prerequisites

- Node.js (v16 or later recommended)  
- npm or yarn package manager  
- Git (optional, for cloning repo)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/cipher.git
   cd cipher/cipher-backend
   ```
Install dependencies:

```bash
npm install
```

### Running the Server

Start the backend server:

```bash
node server.js
```
or 
```bash
npm start
```
By default, the server listens on port 3000. You can configure ports and other settings in the config files.


Access the client:

Open your browser and navigate to:

```
http://localhost:3000/
```
(Will have Networking support soon)

### Login proccess
| Currently, user accounts must be manually whitelisted by the server admin.
| Default chat rooms "Chat" are created automatically.
| The client UI supports messaging, and room switching.

1. User signs up with Username and Password (Password only known to them)
2. Admin (default Username: admin password: admin123) approves them into the server, or bans.
3. User can now say "HI" to everyone!!!

### Admin
Default:
```admin
Username: admin ; Password: admin123
```
Change Username and Password:
1. Start server
2. Login as admin
3. Delete admin
4. Turn off server
5. Edit syncAdminUser.js (cipher-backend/syncAdminUser.js)
6. Change username and password (lines 6 & 7)
7. Save and run server again

Control:
- Admins can see pending users, un-approve, ban, or delete users.
- Admins can see users, unapprove (manual timeout), ban, or delete users (including other admins).
- Admins can create and delete rooms/channels

### Project Architecture
Cipher consists of three main components:
- Server: Handles authentication, message routing, session management, and persistent data storage.
- Server Web Page: Public-facing interface for login, server info, and administrative settings.
- Client Web Page: The chat interface loaded by users; handles messaging, friends, and UI interaction.

The system is designed to support multiple client types in the future, including native apps and terminal clients.

## Contributing
Contributions are welcome! To contribute:

1. Fork the repository

2. Create a feature branch (git checkout -b feature/my-feature)

3. Commit your changes (git commit -m 'Add some feature')

4. Push to the branch (git push origin feature/my-feature)

5. Open a Pull Request describing your changes

### Please ensure code follows existing style guidelines and includes comments where necessary.

License
This project is licensed under the MIT License.

Cipher is a community-driven project. If you want to help shape the future of privacy-respecting, user-centric communication platforms, join the conversation or submit your pull requests!
