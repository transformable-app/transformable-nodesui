import type { RequiredDataFromCollectionSlug } from 'payload'

type FormSeedData = RequiredDataFromCollectionSlug<'forms'>
type RichTextValue = NonNullable<FormSeedData['confirmationMessage']>

const richText = (text: string): RichTextValue => ({
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text,
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

export const issueForm: RequiredDataFromCollectionSlug<'forms'> = {
  confirmationMessage: richText('Thanks. Your issue has been submitted.'),
  confirmationType: 'message',
  fields: [
    {
      name: 'issue',
      blockName: 'issue',
      blockType: 'textarea',
      label: 'Issue',
      required: true,
      width: 100,
    },
    {
      name: 'email',
      blockName: 'email',
      blockType: 'email',
      label: 'Email',
      required: true,
      width: 100,
    },
  ],
  submitButtonLabel: 'Submit issue',
  title: 'Submit Issue',
}
