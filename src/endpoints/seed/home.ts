import type { RequiredDataFromCollectionSlug } from 'payload'
import type { Media } from '@/payload-types'

type HomeArgs = {
  heroImage: Media
  metaImage: Media
}

export const home: (args: HomeArgs) => RequiredDataFromCollectionSlug<'pages'> = ({
  heroImage: _heroImage,
  metaImage: _metaImage,
}) => {
  return {
    title: 'Operations Dashboard',
    slug: 'home',
    _status: 'published',
    description: 'Monitor server health, workflows, and recent execution activity from one place.',
    hero: {
      type: 'none',
    },
    layout: [
      {
        blockType: 'serversStatusList',
        title: 'Server status',
        description: 'Current health snapshot across connected n8n environments.',
        limit: 6,
        showEnvironment: true,
      },
      {
        blockType: 'workflowsList',
        title: 'Workflows',
        description: 'Recently synced workflows from your connected n8n servers.',
        pagingMode: 'pagination',
        limit: 8,
        showServer: true,
      },
      {
        blockType: 'credentialsHealth',
        title: 'Credentials health',
        description: 'Credential status across connected n8n servers.',
        pagingMode: 'pagination',
        limit: 10,
        onlyUnhealthy: false,
      },
      {
        blockType: 'latestExecutions',
        title: 'Latest executions',
        description: 'Most recent execution activity across all available workflows.',
        pagingMode: 'pagination',
        limit: 10,
      },
      {
        blockType: 'executionErrors',
        title: 'Execution errors',
        description: 'Failures that may need attention first.',
        limit: 6,
      },
    ],
  }
}
