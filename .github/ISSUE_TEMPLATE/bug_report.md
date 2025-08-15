# name: 🐛 Bug Report

description: Report an unexpected problem or behavior
labels: [bug]

body:

- type: textarea
  id: what-happened
  attributes:
    label: What happened?
    placeholder: Describe the bug
  validations:
    required: true
- type: input
  id: stack-version
  attributes:
    label: Stack Version
    placeholder: e.g., Portainer CE 2.19.1
- type: textarea
  id: steps
  attributes:
    label: Steps to Reproduce
