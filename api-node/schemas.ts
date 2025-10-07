import { object, string, number, array, optional, url, minLength } from "valibot";

export const AttachmentSchema = object({
  name: string("Attachment name must be a string"),
  url: string("Attachment URL must be a string")
});

export const RequestSchema = object({
  email: string("Email must be a string"),
  secret: string("Secret key is required"),
  task: string("Task must be a string"),
  round: number("Round must be a number"),
  nonce: string("Nonce must be a string"),
  brief: string("Brief must be a string"),
  checks: array(string("Each check must be a string"), "Checks must be an array of strings"),
  evaluationurl: url("Evaluation URL must be a valid URL"),
  attachments: optional(array(AttachmentSchema, "Attachments must be an array of objects"))
});
