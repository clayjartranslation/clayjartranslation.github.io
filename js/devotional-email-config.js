/* Daily devotional by email. Optional. Leave both values empty and the
   subscribe form stays hidden: no form is shown, and nothing is sent to Brevo.

   Click-by-click setup: SETUP-EMAIL.md

   formAction
     The address of the Brevo sign-up form. It looks like
     https://xxxxxxxx.sibforms.com/serve/........
     Copy it from the form’s embed code. Do not paste the rest of that code.
     The form in Brevo must use double confirmation (the person confirms by email).

   listId
     The number of the Brevo list that form adds people to. The same number
     goes in the GitHub secret BREVO_LIST_ID. The form stays hidden until
     both this and formAction are filled in.

   Do not put the Brevo API key in this file. The website is public.
   The key belongs in the GitHub secret BREVO_API_KEY. */
window.CJT_DEVOTIONAL_EMAIL = {
  formAction: 'https://5b7e23a5.sibforms.com/serve/MUIFAAn9L-qrtXgZo3jjIEDZ4EToTRIQtSzSkssWuSEupZLW6QHr7sf-A2ZoN9Mlnt1WqeC8CQ6qjpG4S2eScEr6WmSd59xbXDAsrJ9yz02FVisNEMJlgJlk7SiZ8V4WTcnA1D_PKw_-1ZxOiqhmEa8FV08HFNmmRRI-z1ZQt8HvuV3NRoGu740Wat4LAfq081uukcrwAW1Pj619Ww==',
  listId: '3',
};
