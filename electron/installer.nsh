; ════════════════════════════════════════════════════════════
; ISS Weighbridge — installer activation gate
; Industrial Scale Solutions · Reg. 2025/316125/07
; Asks for an activation code before installing.
; ════════════════════════════════════════════════════════════

; Pull in the macros this script uses. electron-builder usually has these,
; but including them explicitly guarantees ${If}/${NSD_*} resolve.
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

; electron-builder compiles this file twice: once for the installer and once,
; with BUILD_UNINSTALLER defined, for the uninstaller. The activation page only
; exists in the installer, so in the uninstaller pass its functions were
; "not referenced" — a warning, and warnings stop the build.
!ifndef BUILD_UNINSTALLER

Var ISS_Dialog
Var ISS_Field
Var ISS_Code

!macro customPageAfterChangeDir
  Page custom ISS_PageCreate ISS_PageLeave
!macroend

Function ISS_PageCreate
  nsDialogs::Create 1018
  Pop $ISS_Dialog
  ${If} $ISS_Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 40u "${PRODUCT_NAME} - Activation$\r$\n$\r$\nEnter your installation code to continue.$\r$\n(Contact your weighbridge supplier if you do not have a code.)"
  Pop $0

  ${NSD_CreateText} 0 50u 100% 13u ""
  Pop $ISS_Field
  ${NSD_SetFocus} $ISS_Field

  nsDialogs::Show
FunctionEnd

Function ISS_PageLeave
  ${NSD_GetText} $ISS_Field $ISS_Code
  ${If} $ISS_Code != "ISS2025"
    MessageBox MB_OK|MB_ICONSTOP "Incorrect activation code. Installation cannot continue."
    Abort
  ${EndIf}
FunctionEnd

!endif ; BUILD_UNINSTALLER
