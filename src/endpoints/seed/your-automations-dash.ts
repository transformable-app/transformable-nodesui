import type { Form } from '@/payload-types'
import type { RequiredDataFromCollectionSlug } from 'payload'

type YourAutomationsDashArgs = {
  issueForm: Form
}

const dashboardDescription =
  'A dashboard for monitoring automations, workflows, executions, credentials and data tables from multiple self hosted n8n servers with the n8n API.'

export const yourAutomationsDash = ({
  issueForm,
}: YourAutomationsDashArgs): RequiredDataFromCollectionSlug<'pages'> => {
  return {
    title: 'Your Automations Dash',
    slug: 'home',
    _status: 'published',
    description: dashboardDescription,
    layout: [
      {
        blockType: 'serversStatusList',
        title: 'Server status',
        description: 'Current health across connected automation environments.',
        limit: 6,
        showEnvironment: true,
      },
      {
        blockType: 'workflowsList',
        title: 'Workflows',
        description: 'Recently synced automations and their runtime state.',
        pagingMode: 'pagination',
        limit: 8,
        showServer: true,
      },
      {
        blockType: 'credentialsHealth',
        title: 'Credentials health',
        description: 'Credential checks that may need attention.',
        pagingMode: 'pagination',
        limit: 10,
        onlyUnhealthy: false,
      },
      {
        blockType: 'latestExecutions',
        title: 'Latest executions',
        description: 'Recent automation activity from newest to oldest.',
        pagingMode: 'pagination',
        limit: 10,
      },
      {
        blockType: 'executionErrors',
        title: 'Execution errors',
        description: 'Failures to review first.',
        limit: 6,
      },
      {
        blockType: 'formBlock',
        title: 'Submit an issue',
        description: 'Send a brief issue report to the operations team.',
        form: issueForm.id,
      },
    ],
    meta: {
      title: 'Your Automations Dash',
      description: dashboardDescription,
    },
  }
}
