import type { TFunction } from 'i18next'

const ERROR_KEYS: Record<string, string> = {
  'Invalid email or password': 'apiError.invalidLogin',
  'Invalid email or password.': 'apiError.invalidLogin',
  'Email already registered': 'apiError.emailRegistered',
  'Email already registered.': 'apiError.emailRegistered',
  'Username already taken': 'apiError.usernameTaken',
  'Username already taken.': 'apiError.usernameTaken',
  'Workspace name is required.': 'apiError.workspaceNameRequired',
  'Folder name is required.': 'apiError.folderNameRequired',
  'File name is required.': 'apiError.fileNameRequired',
  'Empty file.': 'apiError.emptyFile',
  'Message content is required.': 'apiError.messageRequired',
  'Message cannot exceed 4000 characters.': 'apiError.messageTooLong',
  'Prompt is required.': 'apiError.promptRequired',
  'Content is required.': 'apiError.contentRequired',
  'Choose an image to upload.': 'apiError.chooseImage',
  'Avatar images must be 2 MB or smaller.': 'agents.avatarSize',
  'Avatar must be a PNG, JPEG, WebP or GIF image.': 'apiError.avatarType',
  'Editor did not respond in time.': 'apiError.editorTimeout',
  'Could not reach editor.': 'apiError.editorUnreachable',
}

export function translateApiMessage(message: string, t: TFunction): string {
  const key = ERROR_KEYS[message.trim()]
  return key ? t(key) : message
}
