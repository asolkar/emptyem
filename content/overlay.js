/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Empty 'em.
 *
 * The Initial Developer of the Original Code is
 * Mahesh Asolkar.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * 
 * ***** END LICENSE BLOCK ***** */

var emptyem = {
  onLoad: function() {
    // initialization code
    this.initialized = true;
    this.strings = document.getElementById("emptyem-strings");
    document.getElementById("threadPaneContext")
            .addEventListener("popupshowing", function(e) { this.showContextMenu(e); }, false);
  },

  showContextMenu: function(event) {
    // show or hide the menuitem based on what the context menu is on
    // see http://kb.mozillazine.org/Adding_items_to_menus
    document.getElementById("context-emptyem").hidden = (GetNumSelectedMessages() > 0);
  },
  emptyTrashFolder: function(folder) {
    Application.console.log("Emptying Trash from folder ["
                            + folder.prettiestName + " on "
                            + folder.server.prettyName + "]");
    folder.emptyTrash(null, null);
  },
  emptyJunkFolder: function(folder) {
    Application.console.log("Emptying Junk from folder ["
                            + folder.prettiestName + " on "
                            + folder.server.prettyName + "]");
    var junkMsgs = Components.classes["@mozilla.org/array;1"]
                             .createInstance(Components.interfaces.nsIMutableArray);
    var enumerator = folder.messages;
    while (enumerator.hasMoreElements())
    {
      var msgHdr = enumerator.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
      junkMsgs.appendElement(msgHdr, false);
    }
    if (junkMsgs.length) {
      folder.deleteMessages(junkMsgs, msgWindow, false, false, null, true);
    }
  },
  onMenuItemCommand: function(e) {
    var serverTypes = "";

    //
    // For all servers, find Junk and Trash folders
    //
    try
    {
      var allServers = accountManager.allServers;
      for (var i = 0; i < allServers.Count(); ++i)
      {
        var currentServer = allServers.QueryElementAt(i, Components.interfaces.nsIMsgIncomingServer);
        serverTypes += " " + currentServer.type;

        if ((currentServer.type == "imap") || (currentServer.type == "pop3")) {

          var junkFolder = currentServer.rootFolder.getFolderWithFlags(Components.interfaces.nsMsgFolderFlags.Junk)
                                        .QueryInterface(Components.interfaces.nsIMsgImapMailFolder);

          this.emptyJunkFolder(junkFolder);

          var trashFolder = currentServer.rootFolder.getFolderWithFlags(Components.interfaces.nsMsgFolderFlags.Trash)
                                         .QueryInterface(Components.interfaces.nsIMsgImapMailFolder);

          this.emptyTrashFolder(trashFolder);
        }
      }
    }
    catch(ex)
    {
      Application.console.log(ex);
      Application.console.log(ex.stack);
    }

    Application.console.log("Found " + allServers.Count() + " servers of types: " + serverTypes);

  },
  onToolbarButtonCommand: function(e) {
    // just reuse the function above.  you can change this, obviously!
    emptyem.onMenuItemCommand(e);
  }

};
window.addEventListener("load", function(e) { emptyem.onLoad(e); }, false);
