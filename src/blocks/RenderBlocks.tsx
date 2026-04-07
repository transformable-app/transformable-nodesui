import React, { Fragment } from 'react'

import { ChatEmbedBlock } from '@/blocks/ChatEmbed/Component'
import { CredentialsHealthBlock } from '@/blocks/CredentialsHealth/Component'
import { DataTableViewerBlock } from '@/blocks/DataTableViewer/Component'
import { ExecutionErrorsBlock } from '@/blocks/ExecutionErrors/Component'
import { FormBlock } from '@/blocks/FormBlock/Component'
import { LatestExecutionsBlock } from '@/blocks/LatestExecutions/Component'
import { ServersStatusListBlock } from '@/blocks/ServersStatusList/Component'
import { WorkflowsListBlock } from '@/blocks/WorkflowsList/Component'

const blockComponents = {
  chatEmbed: ChatEmbedBlock,
  credentialsHealth: CredentialsHealthBlock,
  dataTableViewer: DataTableViewerBlock,
  executionErrors: ExecutionErrorsBlock,
  formBlock: FormBlock,
  latestExecutions: LatestExecutionsBlock,
  serversStatusList: ServersStatusListBlock,
  workflowsList: WorkflowsListBlock,
}

export const RenderBlocks: React.FC<{
  blocks?: readonly unknown[] | null
  searchParams?: Record<string, string | string[] | undefined>
}> = (props) => {
  const { blocks, searchParams } = props
  const normalizedBlocks = Array.isArray(blocks)
    ? (blocks as Array<Record<string, unknown> & { blockType?: string }>)
    : []

  const hasBlocks = normalizedBlocks.length > 0

  if (hasBlocks) {
    return (
      <Fragment>
        {normalizedBlocks.map((block, index) => {
          const { blockType } = block

          if (blockType && blockType in blockComponents) {
            const Block = blockComponents[blockType as keyof typeof blockComponents]

            if (Block) {
              const blockProps = block as Record<string, unknown>

              if (blockType === 'executionErrors') {
                return <Block {...blockProps} searchParams={searchParams} key={index} />
              }

              return (
                <div className="mb-10" key={index}>
                  <Block {...blockProps} searchParams={searchParams} />
                </div>
              )
            }
          }
          return null
        })}
      </Fragment>
    )
  }

  return null
}
