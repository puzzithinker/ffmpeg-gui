# Contributing to FFmpeg GUI

Thank you for considering contributing to FFmpeg GUI! This document provides guidelines and instructions for contributing to the project.

## 🎯 Ways to Contribute

- **Report bugs** - Found a bug? Open an issue with detailed reproduction steps
- **Suggest features** - Have an idea? Open an issue to discuss it
- **Fix bugs** - Check open issues and submit a pull request
- **Improve documentation** - Help make the docs clearer and more comprehensive
- **Add tests** - Help improve test coverage

## 🛠️ Development Setup

### Prerequisites

1. **Node.js** 18+ and npm
2. **Rust** 1.77.2+ ([rustup.rs](https://rustup.rs))
3. **FFmpeg** installed and in PATH
4. **Git** for version control

### Platform-Specific Requirements

**Linux:**
```bash
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config
```

**macOS:**
```bash
xcode-select --install
brew install ffmpeg
```

**Windows:**
- Install Visual Studio Build Tools with C++ workload
- Install FFmpeg and add to PATH

### Getting Started

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then:
   git clone https://github.com/YOUR_USERNAME/ffmpeg-gui.git
   cd ffmpeg-gui
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```

4. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

## 📝 Coding Standards

### TypeScript/React

- Use **TypeScript** for all frontend code
- Follow the existing code style (we use ESLint)
- Use **functional components** with hooks
- Keep components focused and single-purpose
- Add JSDoc comments for complex functions

### Rust

- Follow **Rust standard conventions**
- Run `cargo fmt` before committing
- Run `cargo clippy` and fix warnings
- Use **meaningful variable names**
- Add documentation comments (`///`) for public functions
- Handle errors properly with `Result<T, E>`

### Commit Messages

Follow the conventional commits format:

```
type(scope): brief description

Longer description if needed

Co-Authored-By: Your Name <your.email@example.com>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Examples:**
```
feat(process): add support for hardware acceleration

fix(dialog): resolve file path encoding issue on Windows

docs(readme): update build instructions for macOS
```

## 🧪 Testing

### Frontend Testing

```bash
# Type checking
npm run type-check

# Linting
npm run lint
```

### Rust Testing

```bash
cd src-tauri
cargo test
cargo clippy
```

### Manual Testing Checklist

Before submitting a PR, test these core workflows:

- [ ] Video file selection and preview
- [ ] Duration extraction from various formats
- [ ] Timeline trimming (drag handles and manual input)
- [ ] Subtitle file selection
- [ ] Output location selection
- [ ] Video processing with progress updates
- [ ] Process cancellation mid-execution
- [ ] FFmpeg availability check on startup
- [ ] Window close protection during processing
- [ ] Error handling (missing files, invalid formats)

## 📤 Submitting a Pull Request

1. **Update your fork**
   ```bash
   git fetch origin
   git rebase origin/master
   ```

2. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create Pull Request**
   - Go to GitHub and click "New Pull Request"
   - Provide a clear title and description
   - Reference any related issues (#123)
   - Include screenshots/videos for UI changes
   - Check all boxes in the PR template

4. **Address feedback**
   - Respond to review comments
   - Make requested changes
   - Push updates to your branch

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Clear title** - Brief description of the issue
2. **Environment** - OS, version, Tauri version, FFmpeg version
3. **Steps to reproduce** - Detailed step-by-step instructions
4. **Expected behavior** - What you expected to happen
5. **Actual behavior** - What actually happened
6. **Screenshots/logs** - Visual evidence or error logs
7. **Additional context** - Any other relevant information

## 💡 Suggesting Features

When suggesting features:

1. **Search first** - Check if it's already been suggested
2. **Clear use case** - Explain why this feature is needed
3. **Detailed description** - How should it work?
4. **Mockups** (optional) - Visual representation helps!
5. **Alternatives** - Have you considered other approaches?

## 🏗️ Architecture Overview

### Frontend (React + TypeScript)

- **State**: Zustand store (`src/store/useVideoStore.ts`)
- **API Wrapper**: `src/lib/tauri-api.ts` wraps all Tauri commands
- **Components**: Located in `src/components/`
- **Types**: Centralized in `src/types/`

### Backend (Rust)

- **Commands**: `src-tauri/src/commands/` - Tauri command handlers
  - `dialog.rs` - File dialogs
  - `video.rs` - Duration extraction, FFmpeg checks
  - `process.rs` - Video processing with cancellation
- **State**: `src-tauri/src/state.rs` - Job tracking
- **Main**: `src-tauri/src/lib.rs` - Application entry point

### Communication Flow

```
User Action → React Component → tauriAPI wrapper →
Tauri Command (Rust) → FFmpeg/System →
Event Emission → React Component → UI Update
```

## 📚 Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [React Documentation](https://react.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)

## 🤝 Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions
- Follow GitHub's [Community Guidelines](https://docs.github.com/en/site-policy/github-terms/github-community-guidelines)

## ❓ Questions?

- **General questions**: Open a discussion on GitHub
- **Bug reports**: Open an issue
- **Security issues**: Email privately (see SECURITY.md)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to FFmpeg GUI! 🎉
