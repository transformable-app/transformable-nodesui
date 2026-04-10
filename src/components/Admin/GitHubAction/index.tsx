import React from 'react'
import { Github } from 'lucide-react'

const GitHubAction: React.FC = () => {
  return (
    <a
      aria-label="Open GitHub repository"
      className="admin-github-link"
      href="https://github.com/transformable-app/transformable-nodesui"
      rel="noopener noreferrer"
      target="_blank"
    >
      <Github aria-hidden="true" size={20} strokeWidth={2} />
    </a>
  )
}

export default GitHubAction
