import 'dotenv/config';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import mongoose from 'mongoose';
import { scheduleJob } from 'node-schedule';
import { Usuario } from './types/usuario';
import { convertToUsuario, formatDateToBrazilian } from './tools';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs'
import puppeteer from "puppeteer";

(async () => {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const owner = [process.env.NUM_JONI != undefined ? process.env.NUM_JONI : "", process.env.NUM_MAT != undefined ? process.env.NUM_MAT : ""]
    const botNumber = process.env.NUM_BOT;
    const reconnectDelay = 30000;
    const groupId = `${process.env.GROUP_ID}@g.us`;
    let listaAtiva: Usuario[] = [];

    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) { fs.mkdirSync(outputDir); }

    //Database Connection
    async function connectDB() {
        const uri = process.env.MONGO_URI;
        if (typeof uri == 'string') {
            const client = await mongoose.connect(uri);
            return client.connection;
        } else {
            console.log('Erro na conexão com o banco de dados.');
        }
    }

    const usuarioSchema = new mongoose.Schema({ nome: String, numero: String });
    const UsuarioModel = mongoose.model('Usuario', usuarioSchema);

    async function getUsuarios() { 
        try { 
            const usuarios = await UsuarioModel.find({}); return usuarios; 
        } catch (error) {
            console.error('Erro ao buscar usuários:', error); throw error; 
        } 
    }

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: 'client-one' }),
        puppeteer: { headless: true }
    });

    client.on('qr', (qr) => {
        qrcode.generate(qr, { small: true });
    });

    //Logs de controle
    client.on('ready', () => {
        console.log(`Bot conectado com o número: ${botNumber}`);
    });

    client.on('auth_failure', async (message) => {
        console.error('Falha de autenticação', message);
        setTimeout(() => client.initialize(), reconnectDelay);
    });

    client.on('disconnected', async (reason) => {
        console.log('Cliente desconectado', reason);
        setTimeout(() => client.initialize(), reconnectDelay);
    });

    //Cadastro de usuário
    client.on('message', async (msg) => {
        console.log('Mensagem recebida:', msg);
        const from = msg.from;
        const text = msg.body.trim();

        console.log('De:', from);
        console.log('Texto:', text);
        if(
            from.includes(process.env.NUM_JONI != undefined ? process.env.NUM_JONI : "") || from.includes(process.env.NUM_MAT != undefined ? process.env.NUM_MAT : "") || 
            (from.includes(process.env.GROUP_ID != undefined ? process.env.GROUP_ID : "") && msg.author?.includes(process.env.NUM_JONI != undefined ? process.env.NUM_JONI : "")) || 
            (from.includes(process.env.GROUP_ID != undefined ? process.env.GROUP_ID : "") && msg.author?.includes(process.env.NUM_MAT != undefined ? process.env.NUM_MAT : "")) 
        ){
            if (text === '/infocadastrar') {
                console.log('Comando /infocadastrar recebido');
                await client.sendMessage(from, 'Informe o nome e o número da pessoa, separados por vírgula. (Envie o numero nesse formato: 5511912345678)');
                return;
            }
        
            //Cadastro de usuários - done
            if (text.includes('/cadastrar:')) {
                const fullInput : string[] = text.split(':');
                const inputInfo : string[] = fullInput[1].includes(",") ? fullInput[1].split(',') : [];
                
                const usuario: Usuario = { nome: inputInfo[0]?.trim(), numero: inputInfo[1]?.trim() };
                
                if (usuario.nome == "" || !usuario.numero.startsWith('5511') || /[^\d]/.test(usuario.numero)) {
                    await client.sendMessage(from, 'Por favor, envie nome e número para cadastro.');
                    return;
                }

                if (text.endsWith("cadastrar:")) {
                    await client.sendMessage(from, 'Por favor, envie o comando completo: "/cadastrar: <nome>, <numero>"');
                    return;
                }

                try { 
                    const usuarios = await getUsuarios();
                    let flagUser: boolean = false;
                    
                    flagUser = usuarios.some(u => u.nome === usuario.nome || u.numero === usuario.numero);
                    
                    if (!flagUser) {
                        const novoUsuario = new UsuarioModel(usuario); 
                        await novoUsuario.save(); 
                        await client.sendMessage(from, 'Cadastro concluído com sucesso!'); 
                    
                        console.log('Usuário cadastrado com sucesso:', usuario); 
                    }                
                } 
                catch (error) { 
                    console.error('Erro ao inserir usuário no banco de dados:', error); 
                    await client.sendMessage(from, 'Erro ao cadastrar usuário. Tente novamente mais tarde.'); 
                }

                return;
            }

            //Visualizar usuários - done
            if (text.trim() === '/usuarios') { 
                console.log('Comando /usuarios recebido'); 
                try { 
                    const usuarios = await getUsuarios(); 
                    const listaUsuarios = usuarios.map((u) => `Nome: ${u.nome}, Número: ${u.numero}`).join('\n');
                    await client.sendMessage(from, `Usuários cadastrados:\n${listaUsuarios}`); 
                }
                catch (error) { 
                    await client.sendMessage(from, 'Erro ao buscar usuários. Tente novamente mais tarde.'); 
                } 
            }

            //Remoção de usuários - done
            if (text.includes("/remover:")) {
                const fullInput = text.split(':'); 

                if (!fullInput[1]) { 
                    await client.sendMessage(from, 'Por favor, envie o comando completo: "/remover: <nome>, <numero>"'); 
                    return; 
                } 
                
                const inputInfo = fullInput[1].includes(",") ? fullInput[1].split(',') : [];
                const usuarioRmv = { nome: inputInfo[0]?.trim(), numero: inputInfo[1]?.trim() };

                if (!usuarioRmv.nome || !usuarioRmv.numero) {
                    await client.sendMessage(from, 'Por favor, envie o comando completo no formato "/remover: <nome>, <numero>"');
                    return;
                }

                try {
                    const result = await UsuarioModel.deleteOne({ nome: usuarioRmv.nome, numero: usuarioRmv.numero });
                    if (result.deletedCount > 0) { 
                        console.log('Usuário removido com sucesso:', usuarioRmv); 
                        await client.sendMessage(from, 'Usuário removido com sucesso!'); 
                    } else { 
                        console.log('Usuário não encontrado:', usuarioRmv); 
                        await client.sendMessage(from, 'Usuário não encontrado. Verifique o nome e número e tente novamente.'); 
                    } 
                } catch (error) { 
                    console.error('Erro ao remover usuário no banco de dados:', error); 
                    await client.sendMessage(from, 'Erro ao remover usuário. Tente novamente mais tarde.'); 
                } 
            }

            //Info - done
            if (text.trim() === '/info') { 
                console.log('Comando /info recebido'); 
                await client.sendMessage(from, `*COMANDOS DISPONÍVEIS*

*/info* - mostra todos os comandos disponiveis

*/cadastrar: <nome>, <numero>* - cadastra um novo usuário

*/remover: <nome>, <numero>* - remove o usuário com as informações passadas no comando

*/usuarios* - mostra os usuários cadastrados`); 
            }
        }

        if (text.trim() === "/escala") {
            if (listaAtiva.length > 0) {
                let msgEscala : string = '*ESCALA ATUAL*\n';
                listaAtiva.forEach(user => {
                    msgEscala += `${user.data} | ${user.nome}\n`;
                });

                await client.sendMessage(from,msgEscala); 
            } else {
                await client.sendMessage(from, 'Ainda não foi criado uma nova escala, tente novamente mais tarde...'); 
            }
        }

        if (text.trim() === "/iniciarescala") {
            await client.sendMessage(from, 'Escala criada!');
            agendarEnvios(client, owner);
        }

        if (text.trim() === "/normas") {
            await client.sendMessage(from, `Normas do grupo DEVOCIONAL

- Sem comentários muito extravagantes a cada mensagem dos participantes. *(de preferência somente reagir com o emoji)*

- Sem conversas paralelas, que faça perder o foco e o sentido do grupo.

- Respeitar o tempo limite, inserido pelos LÍDERES. *(caso for enviar áudio, no máximo 4 minutos).*

- Favor não se esquecer da data para o envio do seu devocional.`);
        }
    });

    function agendarEnvios(client: Client, owner: string[]) {
        scheduleJob('30 7 * * *', async () => {
            if (listaAtiva.length === 0) {
                console.log("antes da escala");
                await escalaAutomatica();
            }
        })
        scheduleJob('8 * * *', async () => {
            if (listaAtiva.length === 0) {
                console.log("antes da escala");
                await escalaAutomatica();
            }

            const usuario: Usuario = convertToUsuario(listaAtiva.shift());

            if (usuario !== undefined) {
                const mensagemPadrao = `*Paz do Senhor, irmão ${usuario.nome}.*

Eu sou o Maná-Bot e vim te lembrar que hoje é o seu dia de enviar o devocional no nosso grupo.
            
Deus te abençoe.`;
                await client.sendMessage(`${usuario.numero}@c.us`, mensagemPadrao);
                console.log(`Mensagem enviada para ${usuario.numero}`);
            }
        });
    }

    const escalaAutomatica = async (): Promise<void> => {
        const usuariosBD = await getUsuarios();
        const usuarios = usuariosBD.map(usuario => convertToUsuario(usuario));

        let escala: Usuario[] = [];
        let dataInicial = new Date();
        dataInicial.setDate(dataInicial.getDate());

        function shuffleArray(array: any[]): any[] {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }

        escala = shuffleArray(usuarios).map((u, index) => {
            const dataUsuario = new Date(dataInicial);
            dataUsuario.setDate(dataInicial.getDate() + index);
            return {
                index: index,
                nome: u.nome,
                numero: u.numero,
                data: formatDateToBrazilian(dataUsuario.toISOString()).substring(0, 5)
            };
        });

        console.log(escala);

        console.log("depois da escala");

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('devocional');

        worksheet.mergeCells('A1:C1');
        worksheet.getColumn(3).width = 20;
        worksheet.getCell('A1').value = 'Escala do Devocional';
        worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getCell('A1').font = { size: 14, bold: true };
        worksheet.getCell('A1').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: "399AD3"}
        }
        worksheet.getCell('A1').border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };

        worksheet.getRow(2).values = ['Data', 'Nome', 'Numero'];
        worksheet.getRow(2).eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '399AD3' }
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        listaAtiva = escala;
        console.log(listaAtiva);

        listaAtiva.forEach((usuario, index) => {
            const rowIndex = index + 3;
            worksheet.getRow(rowIndex).values = [usuario.data, usuario.nome, usuario.numero];
            worksheet.getRow(rowIndex).eachCell((cell) => {
                cell.font = { bold: false };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFFFF' }
                };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        const xlsxPath = path.join(__dirname, 'output', 'devocional.xlsx');
        await workbook.xlsx.writeFile(xlsxPath);
        console.log('Arquivo Excel estilizado criado:', xlsxPath);
        
        try { 
                const xlsxMedia = MessageMedia.fromFilePath(path.join(xlsxPath));
                await client.sendMessage(groupId, xlsxMedia); 
                for (const o of owner) {
                        await client.sendMessage(`${o}@c.us`, xlsxMedia);
                        console.log(`Imagem enviada para o owner: ${o}`); 
                }

                fs.unlinkSync(path.join(outputDir, 'devocional.xlsx'));
        } catch (error) {
            console.error('Erro ao enviar imagem para os owners:', error);
        }
    };

    (async () => {
        await connectDB();
        client.initialize();
    })();

    await browser.close();
})();

