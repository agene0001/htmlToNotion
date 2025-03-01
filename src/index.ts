import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import { JSDOM } from "jsdom";

import fetch from "node-fetch";

const result = dotenv.config();
// console.log("Token: ", process.env.NOTION_TOKEN)
const child_page_id = "1a7d7b9bf065807f83b5fab5e6f4d0c3"
const parent_page_id ="1a7d7b9bf065808ebc60c7353e24fa3a"
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function main() {


  const response = await notion.pages.retrieve({
    page_id: "1a7d7b9bf065807f83b5fab5e6f4d0c3",

  });
  const url = "https://www.rust-lang.org/learn"
  const baseUrl = new URL(url).origin;
  const page =  await fetch(url);
  if (!page.ok) throw new Error(`Failed to fetch page: ${page.statusText}`);

  const html =  await page.text();

  await addNotionBlocksFromHTML(child_page_id, html,baseUrl)
  console.log("Got response:", response);

}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });




function htmlToNotionBlocks(html: string, url: string) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const blocks: any[] = [];

  function processNode(node: Node) {
    if (node.nodeType === 3 && node.textContent?.trim()) {
      // Text Node
      // blocks.push({
      //   object: "block",
      //   type: "paragraph",
      //   paragraph: {
      //     rich_text: [{ text: { content: node.textContent.trim() } }],
      //   },
      // });
    } else if (node.nodeType === 1) {
      // Element Node
      const element = node as HTMLElement;
      const tag = element.tagName.toLowerCase();

      console.log("Tag: " + tag);
      if (["script", "style", "link", "meta"].includes(tag) || tag.includes("-")) {
        console.log(`Ignoring: <${tag}>`);
        return;
      }

      if (["h1", "h2", "h3"].includes(tag)) {
        const text = element.textContent?.trim();
        if (text) {
          blocks.push({
            object: "block",
            type: `heading_${tag[1]}`, // Converts 'h1' -> '1', 'h2' -> '2'
            [`heading_${tag[1]}`]: {
              rich_text: [{ text: { content: text } }],
            },
          });
        }
      } else if (tag === "p") {
        const text = element.textContent?.trim();
        if (text) {
          blocks.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: text } }],
            },
          });
        }
      } else if (tag === "ul") {
        const listItems = Array.from(element.querySelectorAll("li")).map((li) => {
          const liText = li.textContent?.trim() || "";
          return {
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: [{ text: { content: liText } }],
              children: processNestedNodes(li.childNodes), // Process nested nodes inside <li>
            },
          };
        });

        if (listItems.length > 0) {
          blocks.push({
            object: "block",
            type: "toggle",
            toggle: {
              rich_text: [{ text: { content: "Toggle List" } }],
              children: listItems,
            },
          });
        }
      } else if (tag === "a") {
        const href = element.getAttribute("href") || "";
        const text = element.textContent?.trim() || href;
        // console.log("href: " +href)
        if(href.startsWith("https://"))
        {blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: { content: text, link: { url: href } },
              },
            ],
          },
        });}
        else {blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: { content: text, link: { url: new URL(href,url).href } },
              },
            ],
          },
        });}
      } else if (tag === "img") {
        const src = element.getAttribute("src");
        // console.log("url+src: "+url+src);
        if (src) {
          blocks.push({
            object: "block",
            type: "image",
            image: {
              type: "external",
              external: { url: new URL(src,url).href},
            },
          });
        }
      } else if (tag === "table") {
        const tableBlock = processTable(element as HTMLTableElement);
        if (tableBlock) blocks.push(tableBlock);
      }

      // Recursively process child nodes
      node.childNodes.forEach(processNode);
    }
  }

  function processNestedNodes(nodes: NodeListOf<ChildNode>): any[] {
    return Array.from(nodes).flatMap((child) => {
      if (child.nodeType === 3 && child.textContent?.trim()) {
        return [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: child.textContent.trim() } }],
            },
          },
        ];
      } else if (child.nodeType === 1) {
        const result = processNode(child);

        return Array.isArray(result) ? result : []; // Ensure the return type is always an array
      }
      return [];
    });
  }


  function processTable(table: HTMLTableElement): any {
    const rows = Array.from(table.querySelectorAll("tr"));
    const tableChildren = rows.map((row) => {
      const cells = Array.from(row.querySelectorAll("td, th")).map((cell) => ({
        object: "block",
        type: "table_row",
        table_row: {
          cells: [
            [
              {
                type: "text",
                text: { content: cell.textContent?.trim() || "" },
              },
            ],
          ],
        },
      }));
      return cells;
    });

    return {
      object: "block",
      type: "table",
      table: {
        table_width: rows.length,
        has_column_header: true,
        has_row_header: false,
        children: tableChildren.flat(),
      },
    };
  }

  // Start processing from the body
  document.body.childNodes.forEach(processNode);

  return blocks;
}



//
// 🔹 Function to create a new Notion page from HTML
// async function createNotionPageFromHTML(title:string, html:string) {
//   try {
//     const blocks = htmlToNotionBlocks(html);
//
//     const response = await notion.pages.create({
//       parent: { page_id: parent_page_id },
//       properties: {
//         title: { title: [{ text: { content: title } }] },
//       },
//       children: blocks,
//     });
//
//     console.log("New Notion Page Created:", response);
//   } catch (error) {
//     console.error("Failed to create Notion page:", error);
//   }
// }

// 🔹 Function to add HTML content as blocks to an existing Notion page
async function addNotionBlocksFromHTML(pageId:any, html:string,url:string) {
  try {
    const blocks  = htmlToNotionBlocks(html,url);
  // console.log("Blocks: "+blocks);
    let i=0;
    while(i<blocks.length)
    {await notion.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i,i+100),
    });
    i+=100}

    console.log("Added HTML content to Notion page:", pageId);
  } catch (error) {
    console.error("Failed to add blocks to Notion page:", error);
  }
}