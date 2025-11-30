# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive project configuration files (.gitignore, .gitattributes, .editorconfig)
- Enhanced .env.sample with detailed documentation
- Prettier configuration for code formatting
- Markdownlint configuration
- Trivy ignore file for security scanning
- CODEOWNERS file for PR review assignment
- GitHub issue templates (bug report, feature request)
- Pull request template
- Pre-push git hook for validation

### Changed
- Updated .gitignore to include more comprehensive exclusions
- Enhanced .editorconfig with additional file type configurations
- Improved stack/.env.sample with better documentation

### Fixed
- N/A

### Security
- Added security scanning integration with Trivy

## [1.0.0] - 2025-11-30

### Added
- Initial release of GitOps DVR Stack
- Docker Compose configuration for media automation
- Gluetun VPN integration with PIA
- Service definitions for Sonarr, Radarr, Lidarr, Readarr, Mylar
- Indexer support (NZBHydra2, Jackett)
- Downloader support (Transmission, SABnzbd)
- Justfile for task automation
- Security policy and contributing guidelines
- MIT License
- README with comprehensive documentation

[Unreleased]: https://github.com/kpeacocke/gitops-dvr-stack/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/kpeacocke/gitops-dvr-stack/releases/tag/v1.0.0
