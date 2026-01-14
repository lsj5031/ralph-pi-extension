# Contributing to Ralph Pi Extension

Thank you for your interest in contributing to Ralph! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

### Prerequisites

- [pi code agent](https://github.com/badlogic/pi-mono) installed and working
- Node.js 18+ and npm
- Git
- Familiarity with TypeScript

### Development Setup

1. **Fork and clone the repository:**
```bash
git clone https://github.com/your-username/ralph-pi-extension.git
cd ralph-pi-extension
```

2. **Create a development branch:**
```bash
git checkout -b feature/your-feature-name
```

3. **Test your changes:**
```bash
# Copy the extension to pi's extensions directory
cp ralph.ts ~/.pi/agent/extensions/

# Test with pi
pi "test Ralph with your PRD"
```

## 📋 How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

When creating a bug report, include:
- Clear title and description
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Node version, pi version)
- Screenshots or logs if applicable

### Suggesting Enhancements

Enhancement suggestions are welcome! Please:
- Use a clear and descriptive title
- Provide a detailed description of the enhancement
- Explain why this enhancement would be useful
- Provide examples if applicable

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** with clear, descriptive commit messages
3. **Test thoroughly** with various PRDs and scenarios
4. **Update documentation** if needed
5. **Submit a pull request** with a clear description of changes

#### Pull Request Guidelines

- Keep changes focused and atomic
- Follow the existing code style
- Add comments for complex logic
- Update README.md if user-facing changes
- Test with multiple PRD scenarios
- Ensure all examples work

## 🎯 Areas to Contribute

### Code

- **Core functionality**: Improve Ralph's autonomous loop
- **Quality checks**: Add more validation types
- **Git integration**: Enhanced commit strategies
- **Error handling**: Better recovery mechanisms

### Documentation

- **Examples**: Add more real-world PRD examples
- **Guides**: Write tutorials for specific use cases
- **Videos**: Create demo videos
- **Translations**: Translate to other languages

### Testing

- **Test cases**: Add comprehensive test scenarios
- **Edge cases**: Identify and handle edge cases
- **Performance**: Optimize for large PRDs

## 📝 Code Style

- Use TypeScript for all code
- Follow existing naming conventions
- Add JSDoc comments for functions
- Keep functions focused and small
- Use meaningful variable names

## 🧪 Testing

Before submitting a PR:

1. **Test with simple PRDs:**
```bash
pi "convert this simple PRD: Add user authentication"
```

2. **Test with complex PRDs:**
```bash
pi "convert this PRD: Build a dashboard with filters, charts, and export functionality"
```

3. **Test error cases:**
```bash
pi "what happens with invalid prd.json?"
```

4. **Test Ralph autonomous loop:**
```bash
/ralph 5
```

## 📧 Communication

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and ideas
- **Pull Requests**: For code contributions

## 🎖️ Recognition

Contributors will be:
- Listed in the README.md
- Added to CONTRIBUTORS.md
- Mentioned in release notes

## 📜 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

## ❓ Questions?

Feel free to open a discussion or issue with your question. We're here to help!

---

Thank you for contributing to Ralph! 🎉
